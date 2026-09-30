import type { AnyFieldApi } from "@tanstack/react-form";
import type { KeyboardEvent } from "react";

import { FieldLabelTooltip } from "@/components/inputs/field-label.tooltip";
import { Input } from "@/components/ui/input";

/**
 * Text field row with the shared label tooltip, used by the server and world
 * dialogs (optional Enter handling submits the surrounding form).
 */
export function FormTextField({
  className = "grid gap-2",
  field,
  hint,
  htmlFor,
  label,
  onEnter,
  required = false,
}: {
  className?: string;
  field: AnyFieldApi;
  hint: string;
  htmlFor: string;
  label: string;
  onEnter?: (e: KeyboardEvent) => void;
  required?: boolean;
}) {
  return (
    <div className={className}>
      <FieldLabelTooltip errors={field.state.meta.errors} hint={hint} htmlFor={htmlFor}>
        {label}
        {required ? (
          <span className="text-destructive">*</span>
        ) : (
          <span className="text-muted-foreground text-xs">(optional)</span>
        )}
      </FieldLabelTooltip>
      <Input
        className={field.state.meta.errors.length ? "text-destructive" : ""}
        onChange={(e) => field.handleChange(e.target.value)}
        onKeyUp={onEnter}
        value={field.state.value ?? ""}
      />
    </div>
  );
}
