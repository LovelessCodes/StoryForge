import { cn } from "@/lib/utils";

const DOT_CLASS =
  "absolute size-2 opacity-0 transition-[opacity,scale] duration-300 group-hover/button:scale-[100.8] group-hover/button:opacity-100";
const ICON_REST_CLASS =
  "inline-block size-4 transition-[translate,opacity] duration-300 group-hover/button:translate-x-12 group-hover/button:opacity-0";
const OVERLAY_CLASS =
  "text-primary-foreground absolute top-0 z-10 flex h-full w-full translate-x-12 items-center justify-center gap-2 opacity-0 transition-[translate,opacity] duration-300 group-hover/button:-translate-x-5 group-hover/button:opacity-100 in-data-[state=collapsed]:group-hover/button:-translate-x-2";

/**
 * Sidebar footer button with the shared hover reveal: a coloured dot scales up
 * behind the icon, the icon slides out and a label slides in.
 *
 * Used by the sign in / sign out, settings and Discord entries.
 */
export function SidebarFooterButton({
  icon: Icon,
  dotClassName,
  expandedDotClassName,
  label,
  restLabel,
  className,
  ...props
}: React.ComponentProps<"button"> & {
  /** Rendered twice: sliding out at rest and static in the hover overlay. */
  icon: React.ComponentType<{ className?: string }>;
  /** Dot shown behind the icon in both sidebar states. */
  dotClassName: string;
  /** Extra dot shown only while the sidebar is expanded. */
  expandedDotClassName?: string;
  /** Text revealed on hover. */
  label: string;
  /** Optional text next to the icon before hovering. */
  restLabel?: string;
}) {
  return (
    <button
      className={cn(
        "group/button bg-sidebar relative w-full cursor-pointer overflow-hidden p-2 px-6 text-center font-semibold in-data-[state=collapsed]:px-2",
        className,
      )}
      type="button"
      {...props}
    >
      {/* Rest state: dot + icon (+ optional label) */}
      <div className="flex items-center justify-center gap-2">
        <div className={cn(DOT_CLASS, dotClassName)} />
        {expandedDotClassName ? (
          <div
            className={cn(DOT_CLASS, "in-data-[state=collapsed]:hidden", expandedDotClassName)}
          />
        ) : null}
        <Icon className={ICON_REST_CLASS} />
        {restLabel ? (
          <span className="truncate in-data-[state=collapsed]:hidden">{restLabel}</span>
        ) : null}
      </div>

      {/* Hover state: label slides in */}
      <div className={OVERLAY_CLASS}>
        <span className="in-data-[state=collapsed]:hidden">{label}</span>
        <Icon className="size-4" />
      </div>
    </button>
  );
}
