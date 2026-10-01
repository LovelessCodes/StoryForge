import { createFileRoute } from "@tanstack/react-router";

import NewsPage from "@/components/news/NewsPage";

export const Route = createFileRoute("/_app/news")({
  component: NewsPage,
});
