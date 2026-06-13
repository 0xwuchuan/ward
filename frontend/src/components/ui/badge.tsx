import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-5",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground",
        muted: "border-border bg-muted text-muted-foreground",
        red: "border-red-200 bg-red-50 text-red-700",
        orange: "border-orange-200 bg-orange-50 text-orange-700",
        yellow: "border-yellow-200 bg-yellow-50 text-yellow-800",
        blue: "border-blue-200 bg-blue-50 text-blue-700",
        cyan: "border-cyan-200 bg-cyan-50 text-cyan-700",
        green: "border-green-200 bg-green-50 text-green-700",
        purple: "border-purple-200 bg-purple-50 text-purple-700"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
