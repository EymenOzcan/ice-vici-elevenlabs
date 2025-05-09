
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
  direction?: "up" | "down" | "left" | "right" | "none";
}

export const FadeIn = ({
  children,
  delay = 0,
  duration = 0.4,
  className,
  direction = "up"
}: FadeInProps) => {
  const getDirectionStyles = () => {
    switch (direction) {
      case "up":
        return "translate-y-5";
      case "down":
        return "-translate-y-5";
      case "left":
        return "translate-x-5";
      case "right":
        return "-translate-x-5";
      case "none":
        return "";
    }
  };

  return (
    <div
      className={cn(
        "opacity-0 animate-fade-in",
        direction !== "none" && "animate-slide-in-up",
        direction !== "none" && getDirectionStyles(),
        className
      )}
      style={{
        animationDelay: `${delay}s`,
        animationDuration: `${duration}s`
      }}
    >
      {children}
    </div>
  );
};
