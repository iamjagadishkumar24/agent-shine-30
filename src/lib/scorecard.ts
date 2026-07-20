// Client-safe scorecard utilities. Pure functions + types shared across UI,
// server functions, and email template. Server always re-validates.

export type ScorecardParameter = {
  id: string;
  name: string;
  max_points: number;
  display_order: number;
};

export type ScoreInput = {
  parameter_name: string;
  max_points: number;
  selected_percentage: number;
  evaluator_note?: string | null;
};

export type ScoreRow = ScoreInput & {
  earned_points: number;
};

export type PerformanceLabel =
  | "Excellent"
  | "Good"
  | "Needs Improvement"
  | "Critical Improvement Required";

export function computeEarnedPoints(maxPoints: number, selectedPercentage: number): number {
  const p = Math.max(0, Math.min(100, Number(selectedPercentage) || 0));
  const m = Math.max(0, Number(maxPoints) || 0);
  return Math.round(((m * p) / 100) * 100) / 100;
}

export function computeOverall(scores: Array<Pick<ScoreRow, "max_points" | "selected_percentage">>): {
  earned: number;
  max: number;
  percentage: number;
  label: PerformanceLabel | null;
} {
  const max = scores.reduce((s, r) => s + (Number(r.max_points) || 0), 0);
  const earned = scores.reduce(
    (s, r) => s + computeEarnedPoints(r.max_points, r.selected_percentage),
    0,
  );
  const pct = max === 0 ? 0 : Math.round((earned / max) * 10000) / 100;
  const label = max === 0 ? null : labelFromPercentage(pct);
  return { earned: Math.round(earned * 100) / 100, max, percentage: pct, label };
}

export function labelFromPercentage(pct: number): PerformanceLabel {
  if (pct >= 90) return "Excellent";
  if (pct >= 80) return "Good";
  if (pct >= 70) return "Needs Improvement";
  return "Critical Improvement Required";
}

export function labelTone(label: PerformanceLabel | null | undefined): string {
  switch (label) {
    case "Excellent":
      return "text-emerald-500";
    case "Good":
      return "text-sky-500";
    case "Needs Improvement":
      return "text-amber-500";
    case "Critical Improvement Required":
      return "text-red-500";
    default:
      return "text-muted-foreground";
  }
}
