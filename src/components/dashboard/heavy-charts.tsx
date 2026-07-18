import { memo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from "recharts";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

// ---------------------------------------------------------------------------
export type Range = "Daily" | "Weekly" | "Monthly";

export const TrendChartCard = memo(function TrendChartCard({
  data,
  range,
  onRangeChange,
}: {
  data: Array<{ label: string; sent: number; received: number }>;
  range: Range;
  onRangeChange: (r: Range) => void;
}) {
  return (
    <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl xl:col-span-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">Feedback Trend</div>
          <div className="mt-3 flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.65_0.20_285)]" /> Sent
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.70_0.14_235)]" /> Acknowledged
            </span>
          </div>
        </div>
        <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs">
          {(["Daily", "Weekly", "Monthly"] as const).map((p) => (
            <button
              key={p}
              onClick={() => onRangeChange(p)}
              className={cn(
                "rounded-md px-3 py-1 font-medium transition",
                p === range ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-6 h-72">
        <ResponsiveContainer>
          <AreaChart data={data} margin={{ left: -10, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="grad-sent" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="grad-rcv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Area type="monotone" dataKey="sent" stroke="oklch(0.65 0.20 285)" strokeWidth={2.5} fill="url(#grad-sent)" dot={{ r: 3, fill: "oklch(0.65 0.20 285)", strokeWidth: 0 }} isAnimationActive={false} />
            <Area type="monotone" dataKey="received" stroke="oklch(0.70 0.14 235)" strokeWidth={2.5} fill="url(#grad-rcv)" dot={{ r: 3, fill: "oklch(0.70 0.14 235)", strokeWidth: 0 }} isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------------
export const CategoryDonutCard = memo(function CategoryDonutCard({
  categories,
  totalCat,
  onSliceClick,
}: {
  categories: Array<{ name: string; value: number; pct: number; color: string }>;
  totalCat: number;
  onSliceClick?: (name: string) => void;
}) {
  const list = categories.length ? categories : [{ name: "No data yet", value: 1, pct: 0, color: "oklch(0.26 0.010 265)" } as any];
  const clickable = !!onSliceClick && categories.length > 0;
  return (
    <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl md:col-span-6 xl:col-span-4">
      <div className="text-sm font-semibold">Feedback by Category</div>
      <div className="mt-4 flex items-center gap-4">
        <div className="relative h-44 w-44 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie
                data={list}
                dataKey="value"
                innerRadius={55}
                outerRadius={82}
                paddingAngle={3}
                stroke="none"
                isAnimationActive={false}
                onClick={clickable ? (d: any) => onSliceClick!(d?.name) : undefined}
                cursor={clickable ? "pointer" : "default"}
              >
                {list.map((c: any, i: number) => (
                  <Cell key={i} fill={c.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-2xl font-semibold tabular-nums">{totalCat}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          {list.map((c: any) => {
            const row = (
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: c.color }} />
                  <span className="truncate text-muted-foreground">{c.name}</span>
                </div>
                <span className="tabular-nums text-foreground">{c.pct.toFixed(1)}%</span>
              </div>
            );
            return clickable ? (
              <button
                key={c.name}
                onClick={() => onSliceClick!(c.name)}
                className="w-full rounded-md px-1.5 py-1 -mx-1.5 text-left transition hover:bg-muted/40"
              >
                {row}
              </button>
            ) : (
              <div key={c.name}>{row}</div>
            );
          })}
        </div>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------------
export const QaGaugeCard = memo(function QaGaugeCard({ avgQA }: { avgQA: number }) {
  const safeQA = Number.isFinite(avgQA) ? Math.min(100, Math.max(0, avgQA)) : 0;
  return (
    <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl md:col-span-6 xl:col-span-4">
      <div className="text-sm font-semibold">QA Score</div>
      <div className="relative mt-4 h-52">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="70%" outerRadius="100%" data={[{ name: "qa", value: safeQA, fill: "url(#gauge-grad)" }]} startAngle={180} endAngle={0}>
            <defs>
              <linearGradient id="gauge-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="oklch(0.66 0.22 20)" />
                <stop offset="50%" stopColor="oklch(0.68 0.24 330)" />
                <stop offset="100%" stopColor="oklch(0.72 0.16 160)" />
              </linearGradient>
            </defs>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar background={{ fill: "var(--muted)" }} dataKey="value" cornerRadius={10} isAnimationActive={false} />
          </RadialBarChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-x-0 bottom-6 grid place-items-center">
          <div className="text-3xl font-semibold tabular-nums">{safeQA.toFixed(1)}%</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Average QA</div>
        </div>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------------
export const EmailDonutCard = memo(function EmailDonutCard({
  emailStats,
  emailSlices,
  totalEmails,
}: {
  emailStats: { delivered: number };
  emailSlices: Array<{ name: string; value: number; color: string }>;
  totalEmails: number;
}) {
  const empty = emailSlices.every((s) => s.value === 0);
  const data = empty ? [{ name: "n", value: 1, color: "var(--muted)" } as any] : emailSlices;
  return (
    <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl md:col-span-6 xl:col-span-4">
      <div className="text-sm font-semibold">Email Delivery</div>
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-40 w-40 shrink-0">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={data} dataKey="value" innerRadius={48} outerRadius={72} paddingAngle={3} stroke="none" isAnimationActive={false}>
                {data.map((s: any, i: number) => (
                  <Cell key={i} fill={s.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={TOOLTIP_STYLE} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="text-center">
              <div className="text-xl font-semibold tabular-nums">{emailStats.delivered}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Emails</div>
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1 space-y-2 text-xs">
          {emailSlices.map((s) => {
            const pct = totalEmails > 0 ? (s.value / totalEmails) * 100 : 0;
            return (
              <div key={s.name} className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                  <span className="text-muted-foreground">{s.name}</span>
                </div>
                <span className="tabular-nums">
                  {s.value} <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </Card>
  );
});

// ---------------------------------------------------------------------------
export const ActivityHeatmapCard = memo(function ActivityHeatmapCard({
  heatmap,
  heatMax,
}: {
  heatmap: number[][];
  heatMax: number;
}) {
  return (
    <Card className="col-span-12 rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-semibold">Activity Heatmap</div>
          <div className="text-xs text-muted-foreground">Feedback created by weekday × hour (last 30 days)</div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0.15, 0.35, 0.55, 0.8, 1].map((o) => (
            <span key={o} className="h-3 w-3 rounded-sm" style={{ background: `oklch(0.65 0.20 285 / ${o})` }} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="mt-4 overflow-x-auto">
        <div className="inline-block min-w-full">
          <div className="flex gap-1 pl-8 text-[9px] text-muted-foreground">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="w-4 text-center">{h % 3 === 0 ? h : ""}</div>
            ))}
          </div>
          <TooltipProvider delayDuration={100}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, di) => (
              <div key={day} className="mt-1 flex items-center gap-1">
                <div className="w-8 text-[10px] text-muted-foreground">{day}</div>
                {heatmap[di].map((v, hi) => {
                  const intensity = v / heatMax;
                  return (
                    <UITooltip key={hi}>
                      <TooltipTrigger asChild>
                        <div
                          className="h-4 w-4 rounded-sm ring-1 ring-inset ring-border/30 transition hover:scale-110"
                          style={{
                            background: v === 0 ? "var(--muted)" : `oklch(0.65 0.20 285 / ${0.2 + intensity * 0.8})`,
                          }}
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        {day} {hi}:00 — {v} feedback
                      </TooltipContent>
                    </UITooltip>
                  );
                })}
              </div>
            ))}
          </TooltipProvider>
        </div>
      </div>
    </Card>
  );
});
