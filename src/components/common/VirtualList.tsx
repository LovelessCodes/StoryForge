import { useVirtualizer } from "@tanstack/react-virtual";
import { useEffect, useRef, type ReactNode } from "react";

import { isNearBottom } from "../../lib/log-follow";
import { ScrollArea } from "../ui/scroll-area";
import ScrollToTopButton from "./ScrollToTopButton";

const LIST_GAP = 8;
const DEFAULT_ROW_HEIGHT = 64;

interface VirtualListProps<T> {
  items: T[];
  keyOf: (item: T, index: number) => string;
  renderItem: (item: T) => ReactNode;
  estimateRowHeight?: number;
  empty?: ReactNode;
  scrollButtonAlign?: "right" | "center";
  /** Keep the view pinned to the newest item as items are appended. */
  stickToBottom?: boolean;
  /** Reports when the user scrolls away from, or back to, the bottom. */
  onStickChange?: (stuck: boolean) => void;
}

export default function VirtualList<T>({
  items,
  keyOf,
  renderItem,
  estimateRowHeight = DEFAULT_ROW_HEIGHT,
  empty,
  scrollButtonAlign = "right",
  stickToBottom = false,
  onStickChange,
}: VirtualListProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const stuckRef = useRef(true);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 6,
    gap: LIST_GAP,
    initialRect: { width: 1280, height: 800 },
  });

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || !onStickChange) return;

    const handleScroll = () => {
      const stuck = isNearBottom({
        scrollTop: viewport.scrollTop,
        clientHeight: viewport.clientHeight,
        scrollHeight: viewport.scrollHeight,
      });
      if (stuck !== stuckRef.current) {
        stuckRef.current = stuck;
        onStickChange(stuck);
      }
    };

    viewport.addEventListener("scroll", handleScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", handleScroll);
  }, [onStickChange]);

  useEffect(() => {
    if (!stickToBottom) return;
    const viewport = viewportRef.current;
    if (!viewport) return;

    const frame = requestAnimationFrame(() => {
      viewport.scrollTop = viewport.scrollHeight;
    });
    return () => cancelAnimationFrame(frame);
  }, [stickToBottom, items.length]);

  return (
    <ScrollArea scrollFade viewportRef={viewportRef} className="min-h-0 flex-1">
      {items.length === 0 ? (
        empty
      ) : (
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() + LIST_GAP }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => (
            <div
              key={keyOf(items[virtualRow.index], virtualRow.index)}
              data-index={virtualRow.index}
              ref={rowVirtualizer.measureElement}
              className="absolute inset-x-0 top-0"
              style={{ transform: `translateY(${virtualRow.start}px)` }}
            >
              {renderItem(items[virtualRow.index])}
            </div>
          ))}
        </div>
      )}
      <ScrollToTopButton viewportRef={viewportRef} align={scrollButtonAlign} />
    </ScrollArea>
  );
}
