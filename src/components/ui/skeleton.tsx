import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-muted relative overflow-hidden",
        "after:absolute after:inset-0",
        "after:bg-gradient-to-r after:from-transparent after:via-white/[0.04] after:to-transparent",
        "after:animate-shimmer after:[background-size:200%_100%]",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
