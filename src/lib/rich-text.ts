import { openUrl } from "@tauri-apps/plugin-opener";
import insane, { type AllowedTags } from "insane";
import type { MouseEvent } from "react";

/** Tags kept when rendering untrusted rich text (news items, changelogs). */
const RICH_TEXT_ALLOWED_TAGS: AllowedTags[] = [
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
 * Sanitizes untrusted HTML for rendering: scripts, styles, classes and inline
 * styles are dropped, protocol-relative URLs are made absolute (the forum
 * serves `//media.vintagestory.at/…`) and images lazy-load.
 */
export function renderableRichHtml(html: string): string {
  const sanitized = insane(html, {
    allowedAttributes: {
      a: ["href", "title"],
      img: ["alt", "src", "title"],
    },
    allowedTags: RICH_TEXT_ALLOWED_TAGS,
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

/** Turns rendered rich text back into plain text, for clipboard copies. */
export function richTextToPlainText(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const br of doc.querySelectorAll("br")) br.replaceWith("\n");
  for (const block of doc.querySelectorAll("p, div, li, h1, h2, h3, h4, blockquote, pre")) {
    block.append("\n");
  }
  return (doc.body.textContent ?? "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Rendered rich text lives inside other clickable surfaces; keep its links external. */
export function handleExternalLinkClick(event: MouseEvent<HTMLElement>) {
  const anchor = (event.target as HTMLElement).closest("a");
  if (!anchor) return;
  event.preventDefault();
  const href = anchor.getAttribute("href");
  if (href) void openUrl(href);
}
