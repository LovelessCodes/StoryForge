import { Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";

import { buttonVariants } from "../ui/button";

export default function RouteNotFound() {
  return (
    <div className="bg-background flex h-svh items-center justify-center p-6">
      <div className="flex w-full max-w-md flex-col items-center gap-5 text-center">
        <div className="bg-muted flex size-12 items-center justify-center">
          <SearchX className="text-muted-foreground size-6" />
        </div>

        <div className="grid gap-1.5">
          <h1 className="text-lg font-semibold">Page not found</h1>
          <p className="text-muted-foreground text-sm">
            This page does not exist or was moved. Head back to browsing mods.
          </p>
        </div>

        <Link to="/profiles" className={buttonVariants({ variant: "amber", size: "sm" })}>
          Back to Profiles
        </Link>
      </div>
    </div>
  );
}
