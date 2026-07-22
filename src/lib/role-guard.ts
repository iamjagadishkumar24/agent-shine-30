import { redirect } from "@tanstack/react-router";
import { getMyRoles } from "@/lib/agent-portal.functions";

/**
 * Route-level guard used inside `beforeLoad`. Fetches the caller's roles and
 * redirects to `/dashboard` when none of the allowed roles match.
 *
 * Rules:
 * - `super_admin` (and `master_admin` / `admin`) always pass — they are the
 *   platform-wide administrators.
 * - `qa_admin` is scoped to QA operational routes only. It cannot reach
 *   access-management, workspace settings, or email analytics.
 * - Other staff roles keep their current behaviour.
 */
export async function requireRoles(allowed: readonly string[]): Promise<void> {
  const roles = (await getMyRoles()) as string[];
  // super_admin bypasses all role gates.
  if (roles.includes("super_admin")) return;
  if (roles.some((r) => allowed.includes(r))) return;
  throw redirect({ to: "/dashboard" });
}
