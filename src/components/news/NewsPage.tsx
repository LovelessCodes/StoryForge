import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format } from "date-fns";
import insane from "insane";
import { CircleAlert, ExternalLink, Newspaper, RefreshCw } from "lucide-react";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface NewsItem {
  title: string;
  link: string;
  description: string;
  guid: string;
  pubDate: string;
}

const newsQuery = {
  queryFn: () => invoke("fetch_news") as Promise<NewsItem[]>,
  queryKey: ["news"],
};

/** Sanitize the RSS HTML, then read it back as plain text (entities decoded). */
function descriptionText(html: string): string {
  const stripped = insane(html, { allowedAttributes: {}, allowedTags: [] });
  return new DOMParser().parseFromString(stripped, "text/html").body.textContent ?? "";
}

function formatPubDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "PPp");
}

function errorText(error: unknown): string {
  if (!error) return "Could not reach the Vintage Story forums.";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return "Could not reach the Vintage Story forums.";
}

function NewsSkeleton() {
  return (
    <div className="grid gap-2">
      {[0, 1, 2, 3].map((index) => (
        <div key={index} className="bg-card grid gap-2 border p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-5/6" />
          <Skeleton className="mt-1 h-3 w-24" />
        </div>
      ))}
    </div>
  );
}

export default function NewsPage() {
  const { data: news, error, isPending, isFetching, refetch } = useQuery(newsQuery);

  return (
    <div className="grid gap-6">
      <div>
        <h1 className="text-lg font-semibold">News</h1>
        <p className="text-muted-foreground text-xs">
          Latest announcements from the Vintage Story forums.
        </p>
      </div>

      {isPending ? (
        <NewsSkeleton />
      ) : error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>Failed to load news</AlertTitle>
          <AlertDescription>{errorText(error)}</AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} />
              Retry
            </Button>
          </AlertAction>
        </Alert>
      ) : news && news.length > 0 ? (
        <div className="grid gap-2">
          {news.map((item) => (
            <Card size="sm" key={item.guid} className="hover:bg-muted/40 transition-colors">
              <CardHeader className="gap-1.5">
                <CardTitle>
                  <button
                    type="button"
                    className="text-left transition-colors hover:text-[var(--color-accent-amber)]"
                    onClick={() => void openUrl(item.link)}
                  >
                    {item.title}
                  </button>
                </CardTitle>
                <CardDescription className="line-clamp-4 leading-relaxed">
                  {descriptionText(item.description)}
                </CardDescription>
              </CardHeader>
              <CardFooter className="justify-between gap-3">
                <span className="text-muted-foreground text-xs">{formatPubDate(item.pubDate)}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void openUrl(item.link)}
                >
                  Open post
                  <ExternalLink />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <Newspaper className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-xs">No news found.</p>
          <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            Refresh
          </Button>
        </div>
      )}
    </div>
  );
}
