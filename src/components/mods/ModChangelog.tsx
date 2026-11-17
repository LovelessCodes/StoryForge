import { cn } from "cn";
import { useMemo } from "react";

import { handleExternalLinkClick, renderableRichHtml } from "@/lib/rich-text";

/**
 * Styles the block elements ModDB changelogs use. The HTML is untrusted, so
 * it is sanitized by {@link renderableRichHtml} before it is injected.
 */
const CHANGELOG_PROSE =
  "[&_a]:text-accent-primary [&_a]:underline [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:pl-2 [&_code]:bg-muted [&_code]:px-1 [&_h1]:mt-2 [&_h1]:font-semibold [&_h2]:mt-2 [&_h2]:font-semibold [&_h3]:mt-2 [&_h3]:font-semibold [&_li]:ml-3 [&_ol]:list-decimal [&_p]:mt-1.5 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_strong]:font-medium [&_ul]:list-disc";

/** A changelog written as HTML, rendered safely instead of as visible tags. */
export function ModChangelog({ className, html }: { className?: string; html: string }) {
  const rendered = useMemo(() => renderableRichHtml(html), [html]);
  return (
    <div
      className={cn(CHANGELOG_PROSE, className)}
      dangerouslySetInnerHTML={{ __html: rendered }}
      onClick={handleExternalLinkClick}
    />
  );
}
