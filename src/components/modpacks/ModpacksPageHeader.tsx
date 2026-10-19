import { Link } from "@tanstack/react-router";
import { CloudOff, Plus } from "lucide-react";
import { Trans, useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/use-auth-session";

interface ModpacksPageHeaderProps {
  onCreate: () => void;
}

/** Guest notice and the create action above the modpack list. */
export default function ModpacksPageHeader({ onCreate }: ModpacksPageHeaderProps) {
  const { t } = useTranslation();
  const { user, isLoading } = useAuthSession();

  return (
    <div className="flex items-center justify-between gap-3">
      {!isLoading && !user ? (
        <div className="text-muted-foreground flex items-center gap-2 text-xs">
          <CloudOff className="size-4 shrink-0" />
          <p>
            <Trans
              i18nKey="modpacks.page.guest"
              components={{
                signIn: (
                  <Link className="hover:text-foreground underline underline-offset-2" to="/auth" />
                ),
              }}
            />
          </p>
        </div>
      ) : (
        <span />
      )}
      {user && (
        <Button size="sm" variant="accent-primary" onClick={onCreate}>
          <Plus /> {t("modpacks.page.newModpack")}
        </Button>
      )}
    </div>
  );
}
