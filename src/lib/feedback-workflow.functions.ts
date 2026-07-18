import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Action =
  | { type: "submit"; feedbackId: string; reviewerId?: string; note?: string }
  | { type: "approve"; feedbackId: string; note?: string }
  | { type: "reject"; feedbackId: string; note: string }
  | { type: "request_revision"; feedbackId: string; note: string };

/**
 * Feedback workflow transitions. All transitions:
 *  - are gated by RLS + explicit role checks
 *  - write an audit log entry
 *
 * State machine:
 *  draft ──submit──▶ review ──approve──▶ approved
 *                          └─reject──▶ rejected
 *                          └─request_revision──▶ revision_required ──(edit)──▶ draft
 */
export const transitionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: Action) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status, created_by, reviewer_id")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!fb) throw new Error("Feedback not found or not accessible");

    const isSubmit = data.type === "submit";
    const isReviewDecision =
      data.type === "approve" || data.type === "reject" || data.type === "request_revision";

    // Guardrails on source state
    if (isSubmit && !["draft", "revision_required"].includes(fb.status as string)) {
      throw new Error(`Cannot submit from status "${fb.status}"`);
    }
    if (isReviewDecision && fb.status !== "review") {
      throw new Error(`Cannot ${data.type} — feedback is not under review`);
    }

    // Role check for reviewer actions
    if (isReviewDecision) {
      const { data: allowed } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "qa_admin",
      });
      const { data: allowedSuper } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "super_admin",
      });
      const { data: allowedMgr } = await supabase.rpc("has_role", {
        _user_id: userId,
        _role: "team_manager",
      });
      if (!allowed && !allowedSuper && !allowedMgr) {
        throw new Error("Only qa_admin, team_manager, or super_admin can review feedback");
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

    const { error: updErr } = await supabase
      .from("feedback")
      .update(patch as any)
      .eq("id", data.feedbackId);
    if (updErr) throw new Error(updErr.message);

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action,
      from_status: fb.status as any,
      to_status: toStatus as any,
      comment: (data as any).note ?? null,
      metadata: { source: "workflow" },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true as const, from: fb.status, to: toStatus };
  });
