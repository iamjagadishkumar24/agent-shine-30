/**
 * Single source of truth for coaching_session status values.
 *
 * Must stay in lockstep with the `coaching_status` Postgres enum
 * (see supabase migrations). If you add a value here, add it to the DB
 * enum in the same PR — the DB is authoritative and will reject unknown
 * values at insert time.
 */
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

export type CoachingStatus = Database["public"]["Enums"]["coaching_status"];

export const COACHING_STATUS_VALUES = [
  "scheduled",
  "pending_approval",
  "confirmed",
  "in_progress",
  "completed",
  "canceled",
  "no_show",
  "missed",
  "rescheduled",
] as const satisfies readonly CoachingStatus[];

export const COACHING_STATUS_LABELS: Record<CoachingStatus, string> = {
  scheduled: "Scheduled",
  pending_approval: "Pending approval",
  confirmed: "Confirmed",
  in_progress: "In progress",
  completed: "Completed",
  canceled: "Cancelled",
  no_show: "No show",
  missed: "Missed",
  rescheduled: "Rescheduled",
};

/**
 * Common misspellings and legacy aliases -> canonical enum value.
 * Add new aliases here; never introduce a divergent literal elsewhere.
 */
const ALIASES: Record<string, CoachingStatus> = {
  cancelled: "canceled",
  cancel: "canceled",
  noshow: "no_show",
  "no-show": "no_show",
  inprogress: "in_progress",
  "in-progress": "in_progress",
  pending: "pending_approval",
  "pending-approval": "pending_approval",
};

/**
 * Normalize any user/legacy input to a valid `coaching_status` enum value.
 * Returns `null` when the input can't be mapped — callers should treat that
 * as a validation error rather than silently defaulting.
 */
export function normalizeCoachingStatus(input: unknown): CoachingStatus | null {
  if (typeof input !== "string") return null;
  const key = input.trim().toLowerCase().replace(/\s+/g, "_");
  if ((COACHING_STATUS_VALUES as readonly string[]).includes(key)) {
    return key as CoachingStatus;
  }
  return ALIASES[key] ?? null;
}

/** Zod schema with automatic normalization; throws on unknown values. */
export const coachingStatusSchema = z
  .string()
  .transform((v, ctx) => {
    const norm = normalizeCoachingStatus(v);
    if (!norm) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid coaching status: "${v}"`,
      });
      return z.NEVER;
    }
    return norm;
  });

export function coachingStatusLabel(s: CoachingStatus | string | null | undefined) {
  const norm = normalizeCoachingStatus(s ?? "scheduled") ?? "scheduled";
  return COACHING_STATUS_LABELS[norm];
}
