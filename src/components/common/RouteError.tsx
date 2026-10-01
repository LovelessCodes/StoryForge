import { Link, type ErrorComponentProps } from "@tanstack/react-router";
import { RotateCcw, TriangleAlert } from "lucide-react";

import { Button, buttonVariants } from "../ui/button";

export default function RouteError({ error, reset }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="bg-background flex h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="flex size-12 items-center justify-center bg-[var(--color-warning)]/10">
          <TriangleAlert className="size-6 text-[var(--color-warning)]" />
        </div>

        <div className="grid gap-1.5">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground text-sm">
            Story Forge hit an unexpected error while loading this page.
          </p>
        </div>

        <pre className="bg-muted text-muted-foreground max-h-40 w-full overflow-auto border p-3 text-left text-xs whitespace-pre-wrap">
          {message}
        </pre>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw />
            Try again
          </Button>
          <Link to="/profiles" className={buttonVariants({ variant: "amber", size: "sm" })}>
            Back to Profiles
          </Link>
        </div>
      </div>
    </div>
  );
}
