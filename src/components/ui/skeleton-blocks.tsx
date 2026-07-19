import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function SkeletonBox({ className }: { className?: string }) {
  return <Skeleton className={cn(className)} />;
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

/**
 * Skeleton rows for a `<Table>`. Renders as real <tr>/<td> so it can be used
 * inside <TableBody> during loading without layout shift.
 */
export function TableRowSkeleton({
  columns,
  rows = 5,
  widths,
}: {
  columns: number;
  rows?: number;
  widths?: (string | undefined)[];
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="border-b border-border/50">
          {Array.from({ length: columns }).map((_, c) => (
            <td key={c} className="px-3 py-3">
              <SkeletonBox className={cn("h-3.5", widths?.[c] ?? (c === 0 ? "w-3/4" : "w-1/2"))} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function FormFieldSkeleton() {
  return (
    <div className="space-y-1.5">
      <SkeletonBox className="h-3 w-20" />
      <SkeletonBox className="h-10 w-full rounded-md" />
    </div>
  );
}

export function StatTileSkeleton() {
  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4">
      <SkeletonBox className="h-3 w-20" />
      <SkeletonBox className="mt-3 h-7 w-24" />
    </div>
  );
}
