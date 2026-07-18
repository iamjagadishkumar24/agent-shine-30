import { cn } from "@/lib/utils";

export function SkeletonBox({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-muted/60",
        className,
      )}
    />
  );
}

export function KpiCardSkeleton() {
  return (
    <div className="h-[132px] rounded-2xl border border-border/60 bg-card/60 p-5 backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 space-y-2.5">
          <SkeletonBox className="h-3 w-24" />
          <SkeletonBox className="h-6 w-16" />
        </div>
        <SkeletonBox className="h-10 w-10 rounded-xl" />
      </div>
      <SkeletonBox className="mt-4 h-9 w-full" />
    </div>
  );
}

export function ChartSkeleton({ height = "h-72" }: { height?: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <SkeletonBox className="h-4 w-32" />
        <SkeletonBox className="h-6 w-24" />
      </div>
      <SkeletonBox className={cn("mt-6 w-full", height)} />
    </div>
  );
}

export function ListRowSkeleton() {
  return (
    <div className="flex items-center gap-3 py-2">
      <SkeletonBox className="h-8 w-8 rounded-lg" />
      <div className="flex-1 space-y-1.5">
        <SkeletonBox className="h-3 w-3/4" />
        <SkeletonBox className="h-2.5 w-1/2" />
      </div>
    </div>
  );
}
