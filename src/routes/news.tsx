import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { invoke } from "@tauri-apps/api/core";
import { Loader2 } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ErrorComponent } from "@/components/ui/error";

interface NewsItem {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate: string;
}

export const newsQueryOptions = {
  queryFn: () => invoke("fetch_news") as Promise<NewsItem[]>,
  queryKey: ["news"],
};

export const Route = createFileRoute("/news")({
  component: RouteComponent,
  errorComponent: ErrorComponent,
});

function RouteComponent() {
  // Queries
  const { data: news, isLoading, error } = useQuery(newsQueryOptions);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">Failed to load news.</div>;
  }

  return (
    <div className="flex h-screen w-full grid-rows-[min-content_1fr] flex-col gap-2 py-2">
      <h2 className="mb-2 px-4 text-xl font-bold">Newest releases</h2>
      <div className="box-border flex w-full flex-col space-y-4 overflow-auto px-4">
        {news && news.length > 0 ? (
          news.map((item) => (
            <Card className="w-full transition-shadow hover:shadow-lg" key={item.guid}>
              <Link className="block" rel="noopener noreferrer" target="_blank" to={item.link}>
                <CardContent>
                  <CardHeader>
                    <CardTitle className="text-xl">{item.title}</CardTitle>
                  </CardHeader>
                  <CardDescription className="text-s text-muted-foreground mb-2 line-clamp-4">
                    {item.description.replace(/<\/?[^>]+(>|$)/g, "")}
                  </CardDescription>
                  <CardFooter className="flex justify-end">
                    <p className="text-muted-foreground text-xs">
                      {new Date(item.pubDate).toLocaleString()}
                    </p>
                  </CardFooter>
                </CardContent>
              </Link>
            </Card>
          ))
        ) : (
          <div className="text-muted-foreground">No news found.</div>
        )}
      </div>
    </div>
  );
}
