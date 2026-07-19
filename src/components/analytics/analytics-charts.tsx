import { memo } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";

const TOOLTIP_STYLE = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 10,
  fontSize: 12,
} as const;

const SEVERITY_COLORS: Record<string, string> = {
  critical: "oklch(0.62 0.22 25)",
  high: "oklch(0.72 0.18 55)",
  medium: "oklch(0.75 0.16 90)",
  low: "oklch(0.70 0.14 165)",
  unset: "oklch(0.55 0.02 260)",
};

// Vivid, high-contrast palette for categorical charts (blue, purple, cyan, green, orange, pink).
const CATEGORY_PALETTE = [
  "oklch(0.68 0.18 255)", // blue
  "oklch(0.65 0.22 300)", // purple
  "oklch(0.75 0.14 210)", // cyan
  "oklch(0.72 0.18 155)", // green
  "oklch(0.75 0.17 55)",  // orange
  "oklch(0.70 0.20 350)", // pink
];


function EmptyState({ label }: { label: string }) {
  return (
    <div className="grid h-full w-full place-items-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

function AnalyticsCharts({
  monthly,
  byType,
  bySeverity,
}: {
  monthly: Array<{ label: string; count: number; avgScore: number }>;
  byType: Array<{ label: string; value: number }>;
  bySeverity: Array<{ label: string; value: number }>;
}) {
  const safeMonthly = (monthly ?? []).map((m) => ({
    label: String(m?.label ?? ""),
    count: Number.isFinite(m?.count) ? m.count : 0,
    avgScore: Number.isFinite(m?.avgScore) ? Math.max(0, Math.min(5, m.avgScore)) : 0,
  }));
  const safeByType = (byType ?? []).filter((r) => r && Number.isFinite(r.value) && r.value > 0);
  const safeBySeverity = (bySeverity ?? []).filter(
    (r) => r && Number.isFinite(r.value) && r.value > 0,
  );
  const hasMonthly = safeMonthly.some((m) => m.count > 0 || m.avgScore > 0);
  return (
    <div className="space-y-4">
      <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">12-month feedback trend</div>
            <div className="text-xs text-muted-foreground">Volume and average QA score by month.</div>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.65_0.20_285)]" /> Volume
            </span>
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-[oklch(0.70_0.14_235)]" /> Avg score
            </span>
          </div>
        </div>
        <div className="h-72 w-full">
          {hasMonthly ? (
            <ResponsiveContainer>
              <AreaChart data={safeMonthly} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="g-volume" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="oklch(0.65 0.20 285)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="g-score" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="oklch(0.70 0.14 235)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} />
                <XAxis dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis yAxisId="left" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis yAxisId="right" orientation="right" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} domain={[0, 5]} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Area yAxisId="left" type="monotone" dataKey="count" stroke="oklch(0.65 0.20 285)" strokeWidth={2} fill="url(#g-volume)" isAnimationActive={false} />
                <Area yAxisId="right" type="monotone" dataKey="avgScore" stroke="oklch(0.70 0.14 235)" strokeWidth={2} fill="url(#g-score)" isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState label="No feedback recorded in the last 12 months." />
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <div className="text-sm font-semibold">Feedback by category</div>
            <div className="text-xs text-muted-foreground">Distribution across feedback types.</div>
          </div>
          <div className="h-64 w-full">
            {safeByType.length ? (
              <ResponsiveContainer>
                <BarChart data={safeByType} layout="vertical" margin={{ top: 4, right: 12, left: 12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" opacity={0.4} horizontal={false} />
                  <XAxis type="number" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="label" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} width={110} />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "var(--muted)", opacity: 0.25 }} />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} isAnimationActive={false}>
                    {safeByType.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

            ) : (
              <EmptyState label="No categorized feedback yet." />
            )}
          </div>
        </Card>

        <Card className="rounded-2xl border-border/60 bg-card/60 p-6 backdrop-blur-xl">
          <div className="mb-4">
            <div className="text-sm font-semibold">Severity mix</div>
            <div className="text-xs text-muted-foreground">Composition of open and historical severities.</div>
          </div>
          <div className="h-64 w-full">
            {safeBySeverity.length ? (
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={safeBySeverity}
                    dataKey="value"
                    nameKey="label"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="var(--card)"
                    isAnimationActive={false}
                  >
                    {safeBySeverity.map((s) => (
                      <Cell key={s.label} fill={SEVERITY_COLORS[s.label] ?? "oklch(0.55 0.02 260)"} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Legend
                    verticalAlign="bottom"
                    iconType="circle"
                    wrapperStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState label="No severity data to display." />
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

export default memo(AnalyticsCharts);
