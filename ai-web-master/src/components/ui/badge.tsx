
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "bg-primary/10 text-primary hover:bg-primary/20",
        secondary:
          "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        success:
          "bg-green-100 text-green-700 dark:bg-green-700/20 dark:text-green-400",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20",
        warning:
          "bg-yellow-100 text-yellow-800 dark:bg-yellow-700/20 dark:text-yellow-400",
        info:
          "bg-blue-100 text-blue-700 dark:bg-blue-700/20 dark:text-blue-400",
        outline:
          "text-foreground border border-input bg-background hover:bg-secondary",
      },
      size: {
        default: "h-6",
        sm: "h-5 text-[10px]",
        lg: "h-7 px-3",
      },
      animate: {
        none: "",
        pulse: "animate-pulse",
        shimmer: "relative overflow-hidden before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/20 before:to-transparent",
      }
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      animate: "none",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
  VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, animate, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size, animate }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
