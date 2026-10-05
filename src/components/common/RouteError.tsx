import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw, TriangleAlert } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button, buttonVariants } from "../ui/button";

export default function RouteError({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="bg-background flex h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center bg-[var(--color-warning)]/10">
          <TriangleAlert className="size-6 text-[var(--color-warning)]" />
        </div>

        <div className="grid gap-1.5">
          <h1 className="text-lg font-semibold">{t("layout.errors.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("layout.errors.description")}</p>
        </div>

        <pre className="bg-muted text-muted-foreground max-h-40 w-full overflow-auto border p-3 text-left text-xs whitespace-pre-wrap">
          {message}
        </pre>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw />
            {t("layout.errors.tryAgain")}
          </Button>
          <Link to="/profiles" className={buttonVariants({ variant: "amber", size: "sm" })}>
            {t("layout.errors.backToProfiles")}
          </Link>
        </div>
      </div>
    </div>
  );
}
