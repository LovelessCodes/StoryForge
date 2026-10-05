import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { useTranslation } from "react-i18next";

import { buttonVariants } from "../ui/button";

export default function RouteNotFound() {
  const { t } = useTranslation();
  return (
    <div className="bg-background flex h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="bg-muted flex size-12 items-center justify-center">
          <SearchX className="text-muted-foreground size-6" />
        </div>

        <div className="grid gap-1.5">
          <h1 className="text-lg font-semibold">{t("layout.errors.notFoundTitle")}</h1>
          <p className="text-muted-foreground text-sm">{t("layout.errors.notFoundDescription")}</p>
        </div>

        <Link to="/profiles" className={buttonVariants({ variant: "amber", size: "sm" })}>
          {t("layout.errors.backToProfiles")}
        </Link>
      </div>
    </div>
  );
}
