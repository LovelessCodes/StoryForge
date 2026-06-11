import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete";
import { useQueryClient } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useCallback, useMemo, useRef, useState } from "react";

import type { Mod } from "@/components/lists/mod.list";
import {
  Autocomplete,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@/components/ui/auto-complete";

export const AuthorAutocomplete = ({
  searchText,
  selectedGameVersions,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & {
  searchText: string;
  selectedGameVersions: string[];
}) => {
  const { contains } = AutocompletePrimitive.useFilter({
    sensitivity: "base",
    usage: "search",
  });
  const [internalValue, setInternalValue] = useState("");
  const actualValue = props.value || internalValue;
  const scrollElementRef = useRef<HTMLDivElement>(null);

  const handleValueChange = (value: string) => {
    setInternalValue(value);
    props.onChange?.({
      target: { value },
    } as React.ChangeEvent<HTMLInputElement>);
  };

  const queryClient = useQueryClient();
  const mods = queryClient.getQueryData<Mod[] | undefined>([
    "mods",
    {
      search: searchText,
      versions: selectedGameVersions,
    },
  ]);
  const modAuthors = useMemo(
    () =>
      mods?.reduce(
        (acc, mod) => {
          // Extract unique authors with how many mods they have
          if (mod.author) {
            acc[mod.author] = (acc[mod.author] || 0) + 1;
          }
          return acc;
        },
        {} as Record<string, number>,
      ),
    [mods],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: Shouldn't recompute on every function change
  const filteredItems = useMemo(() => {
    return modAuthors
      ? Object.entries(modAuthors)
          .filter(([author]) => contains(author, actualValue as string))
          .sort(([_authorA, countA], [_authorB, countB]) => countB - countA)
          .map(([author]) => author)
      : [];
  }, [modAuthors, actualValue, contains]);

  const shouldRenderPopup = actualValue !== "";

  const virtualizer = useVirtualizer({
    count: filteredItems.length,
    enabled: shouldRenderPopup,
    estimateSize: () => 40,
    getScrollElement: () => scrollElementRef.current,
    overscan: 20,
  });

  const handleScrollElementRef = useCallback(
    (element: HTMLDivElement) => {
      scrollElementRef.current = element;
      if (element) {
        virtualizer.measure();
      }
    },
    [virtualizer],
  );

  const totalSize = virtualizer.getTotalSize();
  const totalSizePx = `${totalSize}px`;

  return (
    <div className="relative w-48">
      <Autocomplete
        autoHighlight
        items={(modAuthors && Object.keys(modAuthors)) || []}
        itemToStringValue={(author: unknown) => author as string}
        onValueChange={handleValueChange}
        value={actualValue as string}
        virtualized
      >
        <AutocompleteInput
          aria-label="Select author"
          className="h-9"
          placeholder="Select author..."
          showClear
          showTrigger
        />
        {shouldRenderPopup && (
          <AutocompletePopup>
            <AutocompleteList>
              {filteredItems.length > 0 && (
                <div
                  className="h-[min(22rem,var(--total-size))] max-h-(--available-height) scroll-pt-2 overflow-auto overscroll-contain"
                  ref={handleScrollElementRef}
                  role="presentation"
                  style={{ "--total-size": totalSizePx } as React.CSSProperties}
                >
                  <div
                    className="relative w-full"
                    role="presentation"
                    style={{ height: totalSizePx }}
                  >
                    {virtualizer.getVirtualItems().map((virtualItem) => {
                      const author = filteredItems[virtualItem.index];
                      if (!author) return null;
                      if (!modAuthors) return null;
                      const modCount = modAuthors[author];
                      return (
                        <AutocompleteItem
                          aria-posinset={virtualItem.index + 1}
                          aria-setsize={filteredItems.length}
                          className="flex cursor-default py-2 pr-8 pl-4 text-base leading-4 outline-none"
                          index={virtualItem.index}
                          key={virtualItem.key}
                          style={{
                            height: `${virtualItem.size}px`,
                            left: 0,
                            position: "absolute",
                            top: 0,
                            transform: `translateY(${virtualItem.start}px)`,
                            width: "100%",
                          }}
                          value={author}
                        >
                          <div className="flex w-full flex-col">
                            <div className="font-medium">{author}</div>
                            <div className="text-muted-foreground text-xs">
                              {modCount} mod{modCount > 1 ? "s" : ""}
                            </div>
                          </div>
                        </AutocompleteItem>
                      );
                    })}
                  </div>
                </div>
              )}
            </AutocompleteList>
          </AutocompletePopup>
        )}
      </Autocomplete>
    </div>
  );
};
