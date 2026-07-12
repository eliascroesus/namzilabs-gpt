import type { ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-[var(--brand)] text-white hover:bg-[var(--brand-dark)]",
        secondary:
          "border border-[var(--line)] bg-white text-[var(--foreground)] hover:bg-slate-50",
        ghost: "text-[var(--muted)] hover:bg-slate-100 hover:text-[var(--foreground)]",
        danger: "bg-red-600 text-white hover:bg-red-700",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}

export { buttonVariants };
