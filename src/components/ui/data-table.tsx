import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

/**
 * DataTableShell — polished wrapper: rounded card chrome + horizontal scroll.
 * Use inside a <Card> or on its own; pair with sticky <DataTableHeaderRow>.
 */
export function DataTableShell({
  className,
  children,
  maxHeight = "calc(100vh - 280px)",
}: {
  className?: string;
  children: React.ReactNode;
  maxHeight?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-auto rounded-xl border border-border/60 bg-card/60",
        className,
      )}
      style={{ maxHeight }}
    >
      <table className="w-full border-separate border-spacing-0 text-sm">
        {children}
      </table>
    </div>
  );
}

/** Sticky header row — apply on <thead>. */
export function DataTableHeader({ children }: { children: React.ReactNode }) {
  return (
    <thead className="sticky top-0 z-10 bg-muted/60 backdrop-blur supports-[backdrop-filter]:bg-muted/50 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
      {children}
    </thead>
  );
}

export function DataTableRow({
  className,
  onClick,
  children,
}: {
  className?: string;
  onClick?: React.MouseEventHandler<HTMLTableRowElement>;
  children: React.ReactNode;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "group border-b border-border/40 transition-colors hover:bg-accent/40",
        onClick && "cursor-pointer",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  className,
  align,
  children,
  colSpan,
}: {
  className?: string;
  align?: "left" | "right" | "center";
  children: React.ReactNode;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-border/40 px-4 py-3 align-middle",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
    >
      {children}
    </td>
  );
}

/** Sortable header cell. Renders a click-to-sort control with 3-state icons. */
export type SortDir = "asc" | "desc" | null;

export function SortableTh<K extends string>({
  field,
  active,
  dir,
  onSort,
  align = "left",
  className,
  children,
}: {
  field: K;
  active: K | null;
  dir: SortDir;
  onSort: (field: K) => void;
  align?: "left" | "right" | "center";
  className?: string;
  children: React.ReactNode;
}) {
  const isActive = active === field && dir !== null;
  const Icon = !isActive ? ArrowUpDown : dir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "border-b border-border/60 bg-muted/60 px-4 py-2.5 text-left font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        className,
      )}
      aria-sort={isActive ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(field)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded px-1 -mx-1 py-0.5 text-inherit transition-colors hover:text-foreground focus-visible:outline-none",
          align === "right" && "ml-auto",
          isActive && "text-foreground",
        )}
      >
        <span>{children}</span>
        <Icon className={cn("h-3 w-3 opacity-60", isActive && "opacity-100")} />
      </button>
    </th>
  );
}

/** Plain header cell (non-sortable) with matching styling. */
export function StaticTh({
  align = "left",
  className,
  children,
}: {
  align?: "left" | "right" | "center";
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <th
      className={cn(
        "border-b border-border/60 bg-muted/60 px-4 py-2.5 font-medium",
        align === "right" && "text-right",
        align === "center" && "text-center",
        align === "left" && "text-left",
        className,
      )}
    >
      {children}
    </th>
  );
}

/**
 * useTableSort — controlled sort state helper.
 * Cycles asc → desc → cleared on repeated clicks of the same column.
 */
export function useTableSort<K extends string>(initial: K | null = null, initialDir: SortDir = "asc") {
  const [field, setField] = React.useState<K | null>(initial);
  const [dir, setDir] = React.useState<SortDir>(initial ? initialDir : null);
  const onSort = React.useCallback((next: K) => {
    setField((prev) => {
      if (prev !== next) {
        setDir("asc");
        return next;
      }
      setDir((d) => (d === "asc" ? "desc" : d === "desc" ? null : "asc"));
      return d === null ? null : next;
      // Note: when clearing, field is retained but dir becomes null; sortRows treats null as no-op.
    });
  }, []);
  return { field, dir, onSort } as const;
}

/** Sort an array of rows by a resolved comparable value. */
export function sortRows<T>(
  rows: T[],
  getValue: (row: T) => number | string | Date | null | undefined,
  dir: SortDir,
): T[] {
  if (!dir) return rows;
  const copy = [...rows];
  copy.sort((a, b) => {
    const va = getValue(a);
    const vb = getValue(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const na = va instanceof Date ? va.getTime() : typeof va === "number" ? va : String(va).toLowerCase();
    const nb = vb instanceof Date ? vb.getTime() : typeof vb === "number" ? vb : String(vb).toLowerCase();
    if (na < nb) return dir === "asc" ? -1 : 1;
    if (na > nb) return dir === "asc" ? 1 : -1;
    return 0;
  });
  return copy;
}

/** Polished empty state row. */
export function TableEmpty({
  colSpan,
  icon: Icon = Inbox,
  title,
  message,
  action,
}: {
  colSpan: number;
  icon?: React.ComponentType<{ className?: string }>;
  title: string;
  message?: string;
  action?: React.ReactNode;
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-6 py-14">
        <div className="mx-auto flex max-w-sm flex-col items-center text-center">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-muted/60 text-muted-foreground">
            <Icon className="h-5 w-5" />
          </div>
          <div className="text-sm font-medium text-foreground">{title}</div>
          {message && <div className="mt-1 text-xs text-muted-foreground">{message}</div>}
          {action && <div className="mt-4">{action}</div>}
        </div>
      </td>
    </tr>
  );
}

/** Simple, dependency-free pagination. */
export function TablePagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  className,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  pageSizeOptions?: number[];
  className?: string;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t border-border/50 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <span>
          {total === 0 ? "0 results" : (
            <>
              <span className="tabular-nums">{start.toLocaleString()}</span>–
              <span className="tabular-nums">{end.toLocaleString()}</span> of{" "}
              <span className="tabular-nums font-medium text-foreground">{total.toLocaleString()}</span>
            </>
          )}
        </span>
        {onPageSizeChange && (
          <>
            <span className="text-border">·</span>
            <label className="flex items-center gap-1.5">
              <span>Rows</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                className="h-7 rounded-md border border-border/60 bg-background px-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-ring/40"
              >
                {pageSizeOptions.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </Button>
        <span className="px-2 tabular-nums">
          Page <span className="font-medium text-foreground">{page}</span> / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          disabled={page >= totalPages}
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/** Client-side pagination hook. */
export function usePagination(total: number, defaultPageSize = 25) {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(defaultPageSize);
  // Clamp page when total shrinks (e.g. filters applied)
  React.useEffect(() => {
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    if (page > totalPages) setPage(totalPages);
  }, [total, pageSize, page]);
  const setPageSizeSafe = React.useCallback((n: number) => {
    setPageSize(n);
    setPage(1);
  }, []);
  return { page, pageSize, setPage, setPageSize: setPageSizeSafe };
}

export function paginate<T>(rows: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return rows.slice(start, start + pageSize);
}
