import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent bg-clip-padding text-xs font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-1 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/80",
        outline:
          "border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        success:
          "bg-success text-white hover:bg-success/80 focus-visible:border-success/40 focus-visible:ring-success/30",
        warning:
          "bg-warning text-bg-primary hover:bg-warning/80 focus-visible:border-warning/40 focus-visible:ring-warning/30",
        info: "bg-info text-bg-primary hover:bg-info/80 focus-visible:border-info/40 focus-visible:ring-info/30",
        "accent-primary":
          "bg-accent-primary text-white hover:bg-accent-primary-hover focus-visible:border-accent-primary/40 focus-visible:ring-accent-primary/30",
        violet:
          "bg-accent-primary text-white hover:bg-accent-primary-hover focus-visible:border-accent-primary/40 focus-visible:ring-accent-primary/30",
        amber:
          "bg-accent-amber text-bg-primary hover:bg-accent-amber-hover focus-visible:border-accent-amber/40 focus-visible:ring-accent-amber/30",
        "outline-success":
          "border-success/40 bg-transparent text-success hover:bg-success/10 hover:text-success aria-expanded:bg-success/10 aria-expanded:text-success",
        "outline-warning":
          "border-warning/40 bg-transparent text-warning hover:bg-warning/10 hover:text-warning aria-expanded:bg-warning/10 aria-expanded:text-warning",
        "outline-info":
          "border-info/40 bg-transparent text-info hover:bg-info/10 hover:text-info aria-expanded:bg-info/10 aria-expanded:text-info",
        "outline-accent-primary":
          "border-accent-primary/40 bg-transparent text-accent-primary hover:bg-accent-primary/10 hover:text-accent-primary aria-expanded:bg-accent-primary/10 aria-expanded:text-accent-primary",
        "outline-violet":
          "border-accent-primary/40 bg-transparent text-accent-primary hover:bg-accent-primary/10 hover:text-accent-primary aria-expanded:bg-accent-primary/10 aria-expanded:text-accent-primary",
        "outline-amber":
          "border-accent-amber/40 bg-transparent text-accent-amber hover:bg-accent-amber/10 hover:text-accent-amber aria-expanded:bg-accent-amber/10 aria-expanded:text-accent-amber",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        xs: "h-6 gap-1 rounded-none px-2 text-xs has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 rounded-none px-2.5 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2",
        icon: "size-8",
        "icon-xs": "size-6 rounded-none [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-none",
        "icon-lg": "size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
