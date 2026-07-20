import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeEarnedPoints } from "./scorecard";

// ── List disputes (with revisions) for a feedback item ─────────────────────
export const listDisputes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ feedbackId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: disputes, error } = await supabase
      .from("feedback_disputes")
      .select("id, feedback_id, raised_by, reason, status, resolution_note, resolved_by, resolved_at, created_at, updated_at")
      .eq("feedback_id", data.feedbackId)
      .order("created_at", { ascending: false });
    if (error) throw new Response(error.message, { status: 400 });
    if (!disputes || disputes.length === 0) return [];

    const ids = disputes.map((d) => d.id);
    const { data: revisions } = await supabase
      .from("feedback_score_revisions")
      .select("id, dispute_id, parameter_name, original_percentage, revised_percentage, original_earned, revised_earned, max_points, created_at")
      .in("dispute_id", ids);

    // Best-effort attempt to attach a display name for raiser/resolver
    const userIds = new Set<string>();
    for (const d of disputes) {
      if (d.raised_by) userIds.add(d.raised_by);
      if (d.resolved_by) userIds.add(d.resolved_by);
    }
    let profiles: Record<string, string> = {};
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", Array.from(userIds));
      profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, p.full_name ?? ""]));
    }

    return disputes.map((d) => ({
      ...d,
      raised_by_name: profiles[d.raised_by] || null,
      resolved_by_name: d.resolved_by ? profiles[d.resolved_by] || null : null,
      revisions: (revisions ?? []).filter((r) => r.dispute_id === d.id),
    }));
  });

// ── Raise a dispute (agent on their own feedback, or staff) ────────────────
const RaiseSchema = z.object({
  feedbackId: z.string().uuid(),
  reason: z.string().trim().min(10, "Add at least a sentence").max(2000),
});

export const raiseDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => RaiseSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Load feedback + verify the caller is allowed (agent-owner or staff).
    const { data: fb, error: fErr } = await supabase
      .from("feedback")
      .select("id, status, agent_id")
      .eq("id", data.feedbackId)
      .single();
    if (fErr || !fb) throw new Response("Feedback not found", { status: 404 });

    if (!["sent", "acknowledged"].includes(fb.status as string)) {
      throw new Response(
        "Disputes can only be raised on Sent or Acknowledged feedback.",
        { status: 400 },
      );
    }

    // Ensure only one open dispute at a time
    const { data: openRow } = await supabase
      .from("feedback_disputes")
      .select("id")
      .eq("feedback_id", data.feedbackId)
      .eq("status", "open")
      .maybeSingle();
    if (openRow) throw new Response("A dispute is already open for this feedback.", { status: 409 });

    const priorStatus = fb.status as string;

    const { data: inserted, error: iErr } = await supabase
      .from("feedback_disputes")
      .insert({ feedback_id: fb.id, raised_by: userId, reason: data.reason })
      .select("id")
      .single();
    if (iErr || !inserted) throw new Response(iErr?.message ?? "Failed to open dispute", { status: 400 });

    const { error: uErr } = await supabase
      .from("feedback")
      .update({ status: "disputed" })
      .eq("id", fb.id);
    if (uErr) throw new Response(uErr.message, { status: 400 });

    await supabase.from("feedback_audit_log").insert({
      feedback_id: fb.id,
      actor_id: userId,
      action: "dispute_opened",
      from_status: priorStatus as never,
      to_status: "disputed" as never,
      comment: data.reason.slice(0, 500),
      metadata: { dispute_id: inserted.id },
    });

    return { id: inserted.id };
  });

// ── Resolve or reject a dispute (staff only) ───────────────────────────────
const RevisionSchema = z.object({
  parameter_name: z.string().min(1),
  revised_percentage: z.number().min(0).max(100),
});

const ResolveSchema = z.object({
  disputeId: z.string().uuid(),
  action: z.enum(["resolve", "reject"]),
  resolutionNote: z.string().trim().min(5, "Add a short resolution note").max(2000),
  revisions: z.array(RevisionSchema).max(30).optional().default([]),
});

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => ResolveSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Staff-only
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) =>
      ["super_admin", "qa_admin"].includes(r.role as string),
    );
    if (!isStaff) throw new Response("Forbidden", { status: 403 });

    const { data: dispute, error: dErr } = await supabase
      .from("feedback_disputes")
      .select("id, feedback_id, status")
      .eq("id", data.disputeId)
      .single();
    if (dErr || !dispute) throw new Response("Dispute not found", { status: 404 });
    if (dispute.status !== "open") {
      throw new Response("This dispute is already closed.", { status: 409 });
    }

    // If resolving with revisions, apply them and record a revision snapshot.
    if (data.action === "resolve" && data.revisions.length > 0) {
      const { data: currentScores, error: sErr } = await supabase
        .from("feedback_scores")
        .select("parameter_name, selected_percentage, max_points, earned_points")
        .eq("feedback_id", dispute.feedback_id);
      if (sErr) throw new Response(sErr.message, { status: 400 });

      const byName = new Map((currentScores ?? []).map((s) => [s.parameter_name, s]));
      const revisionRows: Array<{
        dispute_id: string;
        feedback_id: string;
        parameter_name: string;
        original_percentage: number;
        revised_percentage: number;
        original_earned: number;
        revised_earned: number;
        max_points: number;
        revised_by: string;
      }> = [];

      for (const r of data.revisions) {
        const cur = byName.get(r.parameter_name);
        if (!cur) continue; // unknown parameter — skip
        if (Number(cur.selected_percentage) === r.revised_percentage) continue; // no change
        const revisedEarned = computeEarnedPoints(Number(cur.max_points), r.revised_percentage);
        revisionRows.push({
          dispute_id: dispute.id,
          feedback_id: dispute.feedback_id,
          parameter_name: r.parameter_name,
          original_percentage: Number(cur.selected_percentage),
          revised_percentage: r.revised_percentage,
          original_earned: Number(cur.earned_points),
          revised_earned: revisedEarned,
          max_points: Number(cur.max_points),
          revised_by: userId,
        });
        const { error: upErr } = await supabase
          .from("feedback_scores")
          .update({
            selected_percentage: r.revised_percentage,
            earned_points: revisedEarned,
          })
          .eq("feedback_id", dispute.feedback_id)
          .eq("parameter_name", r.parameter_name);
        if (upErr) throw new Response(upErr.message, { status: 400 });
      }

      if (revisionRows.length > 0) {
        const { error: revErr } = await supabase
          .from("feedback_score_revisions")
          .insert(revisionRows);
        if (revErr) throw new Response(revErr.message, { status: 400 });
      }
    }

    const closeStatus = data.action === "resolve" ? "resolved" : "rejected";
    const { error: dcErr } = await supabase
      .from("feedback_disputes")
      .update({
        status: closeStatus,
        resolution_note: data.resolutionNote,
        resolved_by: userId,
        resolved_at: new Date().toISOString(),
      })
      .eq("id", dispute.id);
    if (dcErr) throw new Response(dcErr.message, { status: 400 });

    // Flip feedback to resolved once dispute is closed
    const { error: fcErr } = await supabase
      .from("feedback")
      .update({ status: "resolved" })
      .eq("id", dispute.feedback_id);
    if (fcErr) throw new Response(fcErr.message, { status: 400 });

    await supabase.from("feedback_audit_log").insert({
      feedback_id: dispute.feedback_id,
      actor_id: userId,
      action: data.action === "resolve" ? "dispute_resolved" : "dispute_rejected",
      from_status: "disputed" as never,
      to_status: "resolved" as never,
      comment: data.resolutionNote.slice(0, 500),
      metadata: {
        dispute_id: dispute.id,
        revisions_applied: data.action === "resolve" ? data.revisions.length : 0,
      },
    });

    return { ok: true, status: closeStatus };
  });
