import { Link } from "@tanstack/react-router";
import { CloudIcon, LogOutIcon } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuthSession } from "@/hooks/use-auth-session";
import { authClient, clearAuthToken } from "@/lib/auth";
import { t } from "@/lib/i18n";
import { toast } from "@/lib/notify";

async function handleSignOut() {
  try {
    const { error } = await authClient.signOut();
    if (error) throw new Error(error.message ?? t("auth.card.signOutFailed"));
    clearAuthToken();
  } catch {
    toast.error(t("auth.card.signOutFailed"));
  }
}

function InfoRow({ label, value }: { label: string; value: string | undefined }) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-1">
      <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
        {label}
      </span>
      <p className="text-xs font-medium break-all">{value ?? t("auth.card.notSet")}</p>
    </div>
  );
}

/** Optional cloud account card. Everything local works without signing in. */
export default function AccountCard() {
  const { t } = useTranslation();
  const { user, isLoading } = useAuthSession();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="size-4" />
          {t("auth.card.title")}
        </CardTitle>
        <CardDescription>{t("auth.card.description")}</CardDescription>
      </CardHeader>

      <CardContent>
        {isLoading ? (
          <div className="grid gap-3">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        ) : !user ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-xs">{t("auth.card.signedOut")}</p>
            <Button render={<Link to="/auth" />} size="sm" variant="outline">
              {t("auth.actions.signIn")}
            </Button>
          </div>
        ) : (
          <div className="grid gap-3">
            <InfoRow label={t("common.fields.name")} value={user.name} />
            <Separator />
            <InfoRow label={t("common.fields.email")} value={user.email} />
            <Separator />
            <div className="grid gap-1">
              <span className="text-muted-foreground text-[10px] font-medium tracking-widest uppercase">
                {t("auth.card.userId")}
              </span>
              <p className="text-muted-foreground font-mono text-[11px] break-all">{user.id}</p>
            </div>
            <div className="pt-1">
              <Button onClick={() => void handleSignOut()} size="sm" variant="destructive">
                <LogOutIcon /> {t("auth.actions.signOut")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
