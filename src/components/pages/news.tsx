import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
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
import { ScrollArea } from "@/components/ui/scroll-area";

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

export function NewsPage() {
  // Queries
  const { data: news, isLoading, error } = useQuery(newsQueryOptions);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="text-muted-foreground size-8 animate-spin" />
      </div>
    );
  }

  if (error) {
    return <div className="text-red-500">Failed to load news.</div>;
  }

  return (
    <div className="flex size-full grid-rows-[min-content_auto] flex-col gap-2">
      <div className="pt-1.5 pr-2 pl-2 max-md:pl-9">
        <h2 className="text-xl font-bold">Newest releases</h2>
      </div>
      <ScrollArea className="h-full px-2" scrollFade>
        {news && news.length > 0 ? (
          <div className="flex flex-col gap-2">
            {news.map((item) => (
              <Card className="hover:bg-accent/50 w-full transition-colors" key={item.guid}>
                <Link className="block" rel="noopener noreferrer" target="_blank" to={item.link}>
                  <CardContent className="p-3">
                    <CardHeader className="p-0">
                      <CardTitle className="text-xl">{item.title}</CardTitle>
                    </CardHeader>
                    <CardDescription className="text-s text-muted-foreground mb-2 line-clamp-4">
                      {item.description.replace(/<\/?[^>]+(>|$)/g, "")}
                    </CardDescription>
                    <CardFooter className="flex justify-end p-0">
                      <p className="text-muted-foreground text-xs">
                        {new Date(item.pubDate).toLocaleString()}
                      </p>
                    </CardFooter>
                  </CardContent>
                </Link>
              </Card>
            ))}
          </div>
        ) : (
          <div className="text-muted-foreground">No news found.</div>
        )}
      </ScrollArea>
    </div>
  );
}
