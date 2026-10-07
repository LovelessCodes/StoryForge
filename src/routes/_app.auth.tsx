import { createFileRoute } from "@tanstack/react-router";

import AuthPage from "@/components/auth/AuthPage";

export const Route = createFileRoute("/_app/auth")({
  component: AuthPage,
});
