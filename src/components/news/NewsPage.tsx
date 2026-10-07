import { useQuery } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { format, type Locale } from "date-fns";
import insane, { type AllowedTags } from "insane";
import { CircleAlert, ExternalLink, Newspaper, RefreshCw } from "lucide-react";
import { useMemo, type MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { t as translate } from "@/lib/i18n";
import { useDateLocale } from "@/lib/i18n/date-locale";

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

/** Tags kept when rendering a news item's RSS HTML. */
const NEWS_ALLOWED_TAGS: AllowedTags[] = [
  "a",
  "b",
  "blockquote",
  "br",
  "code",
  "em",
  "h1",
  "h2",
  "h3",
  "h4",
  "hr",
  "i",
  "img",
  "li",
  "ol",
  "p",
  "pre",
  "span",
  "strong",
  "u",
  "ul",
];

/**
 * Sanitizes a news item's RSS HTML for rendering: scripts, styles, classes and
 * inline styles are dropped, protocol-relative URLs are made absolute (the
 * forum serves `//media.vintagestory.at/…`) and images lazy-load.
 */
function renderableNewsHtml(html: string): string {
  const sanitized = insane(html, {
    allowedAttributes: {
      a: ["href", "title"],
      img: ["alt", "src", "title"],
    },
    allowedTags: NEWS_ALLOWED_TAGS,
  });
  const doc = new DOMParser().parseFromString(sanitized, "text/html");
  for (const image of doc.querySelectorAll("img")) {
    const src = image.getAttribute("src") ?? "";
    if (src.startsWith("//")) image.setAttribute("src", `https:${src}`);
    image.setAttribute("loading", "lazy");
  }
  for (const anchor of doc.querySelectorAll("a")) {
    const href = anchor.getAttribute("href") ?? "";
    if (href.startsWith("//")) anchor.setAttribute("href", `https:${href}`);
    anchor.setAttribute("rel", "noreferrer");
  }
  return doc.body.innerHTML;
}

/** Rendered descriptions live inside the cards; keep their links external. */
function handleNewsLinkClick(event: MouseEvent<HTMLDivElement>) {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute("href");
  if (href) void openUrl(href);
}

function formatPubDate(value: string, locale: Locale): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : format(date, "PPp", { locale });
}

function errorText(error: unknown): string {
  if (!error) return translate("news.unreachable");
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return translate("news.unreachable");
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
  const { t } = useTranslation();
  const dateLocale = useDateLocale();
  const { data: news, error, isPending, isFetching, refetch } = useQuery(newsQuery);
  const rendered = useMemo(
    () => (news ?? []).map((item) => ({ html: renderableNewsHtml(item.description), item })),
    [news],
  );

  return (
    <div className="grid gap-6">
      {isPending ? (
        <NewsSkeleton />
      ) : error ? (
        <Alert variant="destructive">
          <CircleAlert />
          <AlertTitle>{t("news.failedToLoad")}</AlertTitle>
          <AlertDescription>{errorText(error)}</AlertDescription>
          <AlertAction>
            <Button
              variant="outline"
              size="sm"
              disabled={isFetching}
              onClick={() => void refetch()}
            >
              <RefreshCw className={isFetching ? "animate-spin" : undefined} />
              {t("common.actions.retry")}
            </Button>
          </AlertAction>
        </Alert>
      ) : news && news.length > 0 ? (
        <div className="grid gap-2">
          {rendered.map(({ item, html }) => (
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
                <CardDescription
                  className="[&_a]:text-accent-primary [&_code]:bg-muted line-clamp-6 leading-relaxed [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_code]:px-1 [&_h1]:font-semibold [&_h2]:font-semibold [&_h3]:font-semibold [&_img]:my-1 [&_img]:max-h-40 [&_img]:w-auto [&_img]:border [&_li]:ml-3 [&_ol]:list-decimal [&_p]:mt-1.5 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_strong]:font-medium [&_ul]:list-disc"
                  dangerouslySetInnerHTML={{ __html: html }}
                  onClick={handleNewsLinkClick}
                />
              </CardHeader>
              <CardFooter className="justify-between gap-3">
                <span className="text-muted-foreground text-xs">
                  {formatPubDate(item.pubDate, dateLocale)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => void openUrl(item.link)}
                >
                  {t("news.openPost")}
                  <ExternalLink />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center gap-3 border border-dashed p-10 text-center">
          <Newspaper className="text-muted-foreground size-6" />
          <p className="text-muted-foreground text-xs">{t("news.empty")}</p>
          <Button size="sm" variant="outline" disabled={isFetching} onClick={() => void refetch()}>
            <RefreshCw className={isFetching ? "animate-spin" : undefined} />
            {t("common.actions.refresh")}
          </Button>
        </div>
      )}
    </div>
  );
}
