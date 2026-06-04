import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AuthPage } from "@/components/pages/auth";
import { ErrorComponent } from "@/components/ui/error";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).default("signin").catch("signin"),
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/auth")({
  component: AuthPage,
  errorComponent: ErrorComponent,
  validateSearch: searchSchema,
});
