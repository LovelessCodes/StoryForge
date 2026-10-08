import { invoke } from "@tauri-apps/api/core";
import { OTPInput, type SlotProps } from "input-otp";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { errorInfo } from "@/lib/errors";
import { toast } from "@/lib/notify";
import { cn } from "@/lib/utils";
import { useAccountStore } from "@/stores/accounts";

type SignInResponse = {
  valid: number;
  uid?: string;
  sessionkey?: string;
  sessionsignature?: string;
  playername?: string;
};

interface AddAccountSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialEmail?: string;
}

export default function AddAccountSheet({
  open,
  onOpenChange,
  initialEmail,
}: AddAccountSheetProps) {
  const { t } = useTranslation();
  const { addUser, users } = useAccountStore();
  const [email, setEmail] = useState(initialEmail ?? "");
  const [password, setPassword] = useState("");
  const [preloginToken, setPreloginToken] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [challenge, setChallenge] = useState<"credentials" | "totp">("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    try {
      const data = await invoke<SignInResponse>("login", {
        email,
        password,
        prelogintoken: preloginToken,
        totpcode: totpCode,
      });
      addUser({
        email,
        playername: data.playername,
        sessionkey: data.sessionkey,
        sessionsignature: data.sessionsignature,
        uid: data.uid,
      });
      onOpenChange(false);
    } catch (err) {
      const { message, prelogintoken } = errorInfo(err);
      if (prelogintoken) {
        // Two-factor account: show (or keep) the code challenge. Every attempt
        // gets a fresh pre-login token.
        setPreloginToken(prelogintoken);
        setChallenge("totp");
        setTotpCode("");
        if (message.includes("wrongtotpcode")) {
          setError(t("auth.addAccount.errors.wrongTotp"));
        } else {
          toast.info(t("auth.addAccount.totpPrompt"));
        }
      } else if (message.includes("wrongtotpcode")) {
        setTotpCode("");
        setError(t("auth.addAccount.errors.wrongTotp"));
      } else if (message.includes("ipchanged")) {
        setTotpCode("");
        setError(t("auth.addAccount.errors.ipChanged"));
      } else if (message.includes("invalidemailorpassword")) {
        setError(t("auth.addAccount.errors.invalidCredentials"));
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-sm">
        <SheetHeader className="border-b">
          <SheetTitle>
            {challenge === "totp"
              ? t("auth.addAccount.totpTitle")
              : users.length > 0
                ? t("auth.addAccount.title")
                : t("auth.actions.signIn")}
          </SheetTitle>
          <SheetDescription>
            {challenge === "totp"
              ? t("auth.addAccount.totpDescription")
              : t("auth.addAccount.description")}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea scrollFade className="min-h-0 flex-1">
          <div className="grid gap-4 p-4">
            {challenge === "totp" ? (
              <div className="flex justify-center py-2">
                <OTPInput
                  autoFocus
                  containerClassName="flex items-center gap-2"
                  maxLength={6}
                  value={totpCode}
                  onChange={setTotpCode}
                  onComplete={() => void signIn()}
                  render={({ slots }) => (
                    <div className="flex gap-2">
                      {slots.map((slot, index) => (
                        <OtpSlot key={index} {...slot} />
                      ))}
                    </div>
                  )}
                />
              </div>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <label className="text-xs font-medium" htmlFor="account-email">
                    {t("common.fields.email")}
                  </label>
                  <Input
                    id="account-email"
                    autoComplete="email"
                    placeholder={t("auth.addAccount.emailPlaceholder")}
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium" htmlFor="account-password">
                      {t("common.fields.password")}
                    </label>
                    <a
                      className="text-muted-foreground text-[11px] underline-offset-4 hover:underline"
                      href="https://account.vintagestory.at/requestresetpwd"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {t("auth.addAccount.forgotPassword")}
                    </a>
                  </div>
                  <Input
                    id="account-password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    onKeyUp={(event) => {
                      if (event.key === "Enter" && email && password.length >= 4) {
                        void signIn();
                      }
                    }}
                  />
                </div>
              </>
            )}

            {error && <p className="text-destructive text-xs">{error}</p>}
          </div>
        </ScrollArea>

        <SheetFooter className="border-t">
          <Button
            variant="accent-primary"
            disabled={
              busy ||
              (challenge === "credentials"
                ? !email.includes("@") || password.length < 4
                : totpCode.length !== 6)
            }
            onClick={() => void signIn()}
          >
            {busy
              ? t("auth.actions.signingIn")
              : challenge === "totp"
                ? t("auth.actions.verifyCode")
                : t("auth.actions.signIn")}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function OtpSlot(props: SlotProps) {
  return (
    <div
      className={cn(
        "border-input bg-background text-foreground flex size-9 items-center justify-center border text-sm font-medium transition-colors",
        props.isActive && "border-ring ring-ring/50 z-10 ring-[3px]",
      )}
    >
      {props.char !== null && <span>{props.char}</span>}
    </div>
  );
}
