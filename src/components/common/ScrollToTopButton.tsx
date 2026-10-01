import { cn } from "cn";
import { ArrowUp } from "lucide-react";
import { useEffect, useState, type RefObject } from "react";

import { Button } from "../ui/button";

const SHOW_THRESHOLD = 400;

interface ScrollToTopButtonProps {
  viewportRef: RefObject<HTMLElement | null>;
  /** Horizontal placement. `center` keeps it clear of right-aligned row actions. */
  align?: "right" | "center";
}

export default function ScrollToTopButton({
  viewportRef,
  align = "right",
}: ScrollToTopButtonProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onScroll = () => setVisible(el.scrollTop > SHOW_THRESHOLD);
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [viewportRef]);

  if (!visible) return null;

  const scrollToTop = () => {
    const el = viewportRef.current;
    if (!el) return;
    if (typeof el.scrollTo === "function") {
      el.scrollTo({ top: 0, behavior: "smooth" });
    } else {
      el.scrollTop = 0;
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon-sm"
      aria-label="Scroll to top"
      title="Scroll to top"
      onClick={scrollToTop}
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 absolute bottom-2 z-10 border shadow-lg duration-150",
        align === "center" ? "left-1/2 -translate-x-1/2" : "right-2",
      )}
    >
      <ArrowUp />
    </Button>
  );
}
