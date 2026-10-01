import { invoke } from "@tauri-apps/api/core";
import { OTPInput, type SlotProps } from "input-otp";
import { useState } from "react";

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
      toast.success(`Welcome back, ${data.playername || "player"}!`);
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const extra = err as Error & { prelogintoken?: string };
      if (message.includes("requiretotpcode")) {
        setPreloginToken(extra.prelogintoken ?? "");
        setChallenge("totp");
        setTotpCode("");
        toast.info("Enter your authenticator code to continue.");
      } else if (message.includes("wrongtotpcode")) {
        setTotpCode("");
        setError("Invalid authenticator code — try again.");
      } else if (message.includes("ipchanged")) {
        setTotpCode("");
        setError("Your IP changed — sign in again.");
      } else if (message.includes("invalidemailorpassword")) {
        setError("Invalid email or password.");
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
              ? "Enter authenticator code"
              : users.length > 0
                ? "Add account"
                : "Sign in"}
          </SheetTitle>
          <SheetDescription>
            {challenge === "totp"
              ? "Check your authenticator app and type the 6-digit code."
              : "Sign in with your Vintage Story account. Credentials are only sent to vintagestory.at."}
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
                    Email
                  </label>
                  <Input
                    id="account-email"
                    autoComplete="email"
                    placeholder="player@example.com"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                  />
                </div>
                <div className="grid gap-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium" htmlFor="account-password">
                      Password
                    </label>
                    <a
                      className="text-muted-foreground text-[11px] underline-offset-4 hover:underline"
                      href="https://account.vintagestory.at/requestresetpwd"
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      Forgot password?
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
            {busy ? "Signing in…" : challenge === "totp" ? "Verify code" : "Sign in"}
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
