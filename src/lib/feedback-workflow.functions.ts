import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Strong input schema — reject anything malformed at the boundary.
const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("submit"),
    feedbackId: z.string().uuid(),
    reviewerId: z.string().uuid().optional(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("approve"),
    feedbackId: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("reject"),
    feedbackId: z.string().uuid(),
    note: z.string().trim().min(1, "A rejection note is required").max(2000),
  }),
  z.object({
    type: z.literal("request_revision"),
    feedbackId: z.string().uuid(),
    note: z.string().trim().min(1, "A revision note is required").max(2000),
  }),
]);

type Action = z.infer<typeof ActionSchema>;

/**
 * Feedback workflow transitions. All transitions:
 *  - are gated by RLS + explicit role checks
 *  - use optimistic concurrency (status must match on update)
 *  - write an audit log entry
 *
 * State machine:
 *  draft ──submit──▶ review ──approve──▶ approved
 *                          └─reject──▶ rejected
 *                          └─request_revision──▶ revision_required ──(edit)──▶ draft
 */
export const transitionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: Action): Action => {
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Response(parsed.error.issues[0]?.message ?? "Invalid request", { status: 400 });
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status, created_by, reviewer_id")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) throw new Response(readErr.message, { status: 500 });
    if (!fb) throw new Response("Feedback not found or not accessible", { status: 404 });

    const isSubmit = data.type === "submit";
    const isReviewDecision =
      data.type === "approve" || data.type === "reject" || data.type === "request_revision";

    // Guardrails on source state
    if (isSubmit && !["draft", "revision_required"].includes(fb.status as string)) {
      throw new Response(`Cannot submit from status "${fb.status}"`, { status: 409 });
    }
    if (isReviewDecision && fb.status !== "review") {
      throw new Response(
        `Cannot ${data.type} — feedback is not under review`,
        { status: 409 },
      );
    }

    // Role check for reviewer actions — parallelize the three role probes.
    if (isReviewDecision) {
      const [{ data: allowed }, { data: allowedSuper }, { data: allowedMgr }] = await Promise.all([
        supabase.rpc("has_role", { _user_id: userId, _role: "qa_admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "super_admin" }),
        supabase.rpc("has_role", { _user_id: userId, _role: "team_manager" }),
      ]);
      if (!allowed && !allowedSuper && !allowedMgr) {
        throw new Response(
          "Only qa_admin, team_manager, or super_admin can review feedback",
          { status: 403 },
        );
      }
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {};
    let toStatus: string;
    let action: string;

    switch (data.type) {
      case "submit":
        toStatus = "review";
        action = "submit_for_review";
        patch.status = "review";
        patch.submitted_for_review_at = now;
        if (data.reviewerId) patch.reviewer_id = data.reviewerId;
        break;
      case "approve":
        toStatus = "approved";
        action = "approve";
        patch.status = "approved";
        patch.reviewer_id = userId;
        patch.reviewed_at = now;
        patch.review_note = data.note ?? null;
        break;
      case "reject":
        toStatus = "rejected";
        action = "reject";
        patch.status = "rejected";
        patch.reviewer_id = userId;
        patch.reviewed_at = now;
        patch.review_note = data.note;
        break;
      case "request_revision":
        toStatus = "revision_required";
        action = "request_revision";
        patch.status = "revision_required";
        patch.reviewer_id = userId;
        patch.reviewed_at = now;
        patch.review_note = data.note;
        break;
    }

    // Optimistic concurrency: require the row to still be in the observed
    // source status. A racing transition returns 0 rows and we surface 409.
    const { data: updated, error: updErr } = await supabase
      .from("feedback")
      // deno-lint-ignore no-explicit-any
      .update(patch as any)
      .eq("id", data.feedbackId)
      .eq("status", fb.status as never)
      .select("id")
      .maybeSingle();
    if (updErr) throw new Response(updErr.message, { status: 500 });
    if (!updated) {
      throw new Response(
        "This feedback was updated by someone else. Refresh and try again.",
        { status: 409 },
      );
    }

    const note = "note" in data ? data.note ?? null : null;
    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action,
      // deno-lint-ignore no-explicit-any
      from_status: fb.status as any,
      // deno-lint-ignore no-explicit-any
      to_status: toStatus as any,
      comment: note,
      metadata: { source: "workflow" },
    });
    // Audit log failures must not roll back the transition (RLS already
    // verified the caller). Log server-side and continue.
    if (logErr) console.error("feedback_audit_log insert failed", logErr);

    return { ok: true as const, from: fb.status, to: toStatus };
  });
