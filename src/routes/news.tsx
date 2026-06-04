import { createFileRoute } from "@tanstack/react-router";

import { NewsPage } from "@/components/pages/news";
import { ErrorComponent } from "@/components/ui/error";

export const Route = createFileRoute("/news")({
  component: NewsPage,
  errorComponent: ErrorComponent,
});
