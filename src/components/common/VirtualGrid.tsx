import { useVirtualizer } from "@tanstack/react-virtual";
import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";

import { ScrollArea } from "../ui/scroll-area";
import ScrollToTopButton from "./ScrollToTopButton";

const ROW_GAP = 16;
const DEFAULT_ROW_HEIGHT = 168;

function getColumnCount(width: number) {
  if (width >= 1280) return 4;
  if (width >= 768) return 3;
  return 2;
}

interface VirtualGridProps<T> {
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  estimateRowHeight?: number;
  empty?: ReactNode;
}

export default function VirtualGrid<T>({
  items,
  keyOf,
  renderItem,
  estimateRowHeight = DEFAULT_ROW_HEIGHT,
  empty,
}: VirtualGridProps<T>) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(3);

  // Derive the responsive column count from the scroll viewport width
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      setColumns(getColumnCount(el.clientWidth));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const rowCount = Math.ceil(items.length / columns);
  // oxlint-disable-next-line react/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => estimateRowHeight,
    overscan: 4,
    gap: ROW_GAP,
    initialRect: { width: 1280, height: 800 },
  });

  return (
    <ScrollArea scrollFade viewportRef={viewportRef} className="min-h-0 flex-1">
      {items.length === 0 ? (
        empty
      ) : (
        <div
          className="relative w-full"
          style={{ height: rowVirtualizer.getTotalSize() + ROW_GAP }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const start = virtualRow.index * columns;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute inset-x-0 top-0 grid gap-4"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                  gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                }}
              >
                {items.slice(start, start + columns).map((item) => (
                  <Fragment key={keyOf(item)}>{renderItem(item)}</Fragment>
                ))}
              </div>
            );
          })}
        </div>
      )}
      <ScrollToTopButton viewportRef={viewportRef} />
    </ScrollArea>
  );
}
