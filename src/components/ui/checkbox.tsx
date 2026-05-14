import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";

import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "relative inline-flex size-4 shrink-0 items-center justify-center rounded-[0.25rem] border border-input bg-background bg-clip-padding shadow-xs ring-ring transition-shadow outline-none before:pointer-events-none before:absolute before:inset-0 before:rounded-[calc(0.25rem-1px)] not-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_1px_--theme(--color-black/4%)] focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-64 aria-invalid:border-destructive/36 focus-visible:aria-invalid:border-destructive/64 focus-visible:aria-invalid:ring-destructive/48 dark:bg-clip-border dark:not-data-checked:bg-input/32 dark:not-disabled:not-data-checked:not-aria-invalid:before:shadow-[0_-1px_--theme(--color-white/8%)] dark:aria-invalid:ring-destructive/24 [&:is(:disabled,[data-checked],[aria-invalid])]:shadow-none",
        className,
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="text-primary-foreground data-checked:bg-primary data-indeterminate:text-foreground absolute -inset-px flex items-center justify-center rounded-[0.25rem] data-unchecked:hidden"
        data-slot="checkbox-indicator"
        render={(props, state) => (
          <span {...props}>
            {state.indeterminate ? (
              <svg
                className="size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Indeterminate Checkbox</title>
                <path d="M5.252 12h13.496" />
              </svg>
            ) : (
              <svg
                className="size-3"
                fill="none"
                height="24"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="3"
                viewBox="0 0 24 24"
                width="24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <title>Checked Checkbox</title>
                <path d="M5.252 12.7 10.2 18.63 18.748 5.37" />
              </svg>
            )}
          </span>
        )}
      />
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
