import { cn } from "cn";

import { Card, CardFooter, CardHeader } from "../ui/card";

interface SkeletonProps {
  className?: string;
  animationDelay?: number;
}

function Skeleton({ className = "", animationDelay = 0 }: SkeletonProps) {
  return (
    <div
      className={cn("animate-pulse rounded bg-muted", className)}
      style={{ animationDelay: `${animationDelay}ms` }}
    />
  );
}

export function CardSkeleton({ animationDelay = 0 }: { animationDelay?: number }) {
  const skeletonProps = { animationDelay };

  return (
    <Card size="sm" className="h-full">
      <CardHeader className="grid-cols-[auto_1fr] items-start gap-3">
        <Skeleton {...skeletonProps} className="size-14 shrink-0 rounded-lg" />

        <div className="grid min-w-0 gap-0.5">
          <Skeleton {...skeletonProps} className="h-5 w-3/4" />
          <Skeleton {...skeletonProps} className="h-3.5 w-1/3" />
          <div className="mt-1 grid gap-1.5">
            <Skeleton {...skeletonProps} className="h-3.5 w-full" />
            <Skeleton {...skeletonProps} className="h-3.5 w-2/3" />
          </div>
        </div>
      </CardHeader>

      <CardFooter className="mt-auto justify-between">
        <div className="flex items-center gap-2">
          <Skeleton {...skeletonProps} className="h-3.5 w-20" />
          <Skeleton {...skeletonProps} className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton {...skeletonProps} className="h-8 w-20 rounded-md" />
      </CardFooter>
    </Card>
  );
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-lg border border-[var(--color-border-subtle)] bg-[var(--color-bg-card)] p-3"
        >
          <Skeleton className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="h-6 w-12 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function GridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} animationDelay={i * 100} />
      ))}
    </div>
  );
}

export default Skeleton;
