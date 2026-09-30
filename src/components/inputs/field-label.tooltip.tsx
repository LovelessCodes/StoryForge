import { Label } from "@/components/ui/label";
import { TooltipTrigger } from "@/components/ui/tooltip";
import { rootTooltipHandle } from "@/handles";
import { cn } from "@/lib/utils";

/** Unique messages of a TanStack Form field error list (strings or issues). */
function errorMessages(errors: ReadonlyArray<unknown>): string[] {
  const messages = errors.map((error) =>
    typeof error === "string" ? error : ((error as { message?: string } | null)?.message ?? ""),
  );
  return [...new Set(messages.filter(Boolean))];
}

/**
 * Form label with a tooltip that carries a hint and the field's validation
 * errors. Shared by the installation, add version, edit world and add user
 * dialogs, which all repeated the TooltipTrigger + Label + error-list block.
 */
export function FieldLabelTooltip({
  children,
  className,
  errors,
  hint,
  htmlFor,
}: {
  children?: React.ReactNode;
  className?: string;
  errors: ReadonlyArray<unknown>;
  /** First tooltip line describing what to enter. */
  hint: string;
  htmlFor: string;
}) {
  return (
    <TooltipTrigger
      render={
        <Label
          className={cn("w-fit", errors.length > 0 && "text-destructive", className)}
          htmlFor={htmlFor}
        />
      }
      handle={rootTooltipHandle}
      payload={() => (
        <>
          <p className="text-xs">{hint}</p>
          {errorMessages(errors).map((message) => (
            <p className="text-destructive text-xs" key={message}>
              {message}
            </p>
          ))}
        </>
      )}
    >
      {children}
    </TooltipTrigger>
  );
}
