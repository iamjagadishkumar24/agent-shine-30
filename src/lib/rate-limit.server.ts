// Server-only rate limiter. Never import from client-reachable modules
// (the .server.ts extension enforces this).
//
// Usage:
//   import { enforceRateLimit } from "@/lib/rate-limit.server";
//   await enforceRateLimit({ bucket: "ai.draft", key: userId });
//
// Limits are configurable via env vars using the pattern
//   RATE_LIMIT_<BUCKET_UPPER_SNAKE>=<count>:<windowSeconds>
// e.g. RATE_LIMIT_AI_DRAFT="20:3600" → 20 calls per hour.
//
// Falls back to sane defaults per bucket if the env override is missing.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { throwSafe } from "@/lib/safe-error";

export type RateLimitBucket =
  | "ai.draft"
  | "export.enqueue"
  | "invitation.send"
  | "invitation.accept"
  | "email.test"
  | "email.send"
  | "feedback.create"
  | "auth.password_reset";

const DEFAULTS: Record<RateLimitBucket, { limit: number; windowSeconds: number }> = {
  "ai.draft":            { limit: 20,  windowSeconds: 3600 },
  "export.enqueue":      { limit: 30,  windowSeconds: 3600 },
  "invitation.send":     { limit: 50,  windowSeconds: 3600 },
  "invitation.accept":   { limit: 10,  windowSeconds: 900 },
  "email.test":          { limit: 15,  windowSeconds: 3600 },
  "email.send":          { limit: 200, windowSeconds: 3600 },
  "feedback.create":     { limit: 100, windowSeconds: 3600 },
  "auth.password_reset": { limit: 5,   windowSeconds: 900 },
};

function readEnvOverride(bucket: RateLimitBucket) {
  const envKey =
    "RATE_LIMIT_" + bucket.replace(/[.\-]/g, "_").toUpperCase();
  const raw = process.env[envKey];
  if (!raw) return null;
  const m = /^(\d+):(\d+)$/.exec(raw.trim());
  if (!m) return null;
  return { limit: parseInt(m[1], 10), windowSeconds: parseInt(m[2], 10) };
}

/**
 * Check-and-record a rate-limited action. Throws a safe RATE_LIMITED
 * error when over-limit; otherwise resolves silently.
 *
 * If the DB call itself fails, we FAIL OPEN and log — the alternative
 * (blocking every request during a Postgres blip) is worse than a small
 * rate-limit gap.
 */
export async function enforceRateLimit(args: {
  bucket: RateLimitBucket;
  key: string; // typically userId; use `ip:<addr>` for unauthenticated buckets
}): Promise<void> {
  const cfg = readEnvOverride(args.bucket) ?? DEFAULTS[args.bucket];
  try {
    const { data, error } = await supabaseAdmin.rpc("check_rate_limit", {
      _bucket: args.bucket,
      _key: args.key,
      _limit: cfg.limit,
      _window_seconds: cfg.windowSeconds,
    });
    if (error) {
      console.warn("[rate-limit] rpc error, failing open", {
        bucket: args.bucket,
        error: error.message,
      });
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (row && row.allowed === false) {
      throwSafe(
        "RATE_LIMITED",
        { bucket: args.bucket, key: args.key, retryAfter: row.retry_after_seconds },
      );
    }
  } catch (err) {
    // If we've already thrown a safe error, re-throw it.
    if (err instanceof Error && (err as Error & { code?: string }).code === "RATE_LIMITED") {
      throw err;
    }
    console.warn("[rate-limit] unexpected, failing open", err);
  }
}
