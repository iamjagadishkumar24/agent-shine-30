import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { computeEarnedPoints, computeOverall, labelFromPercentage } from "./scorecard";

// ── Get active scorecard template + parameters ─────────────────────────────
export const getActiveScorecard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: tpl, error: tErr } = await supabase
      .from("scorecard_templates")
      .select("id, name, version")
      .eq("is_active", true)
      .maybeSingle();
    if (tErr) throw new Response("Failed to load scorecard", { status: 500 });
    if (!tpl) return { template: null, parameters: [] as { id: string; name: string; max_points: number; display_order: number }[] };
    const { data: params, error: pErr } = await supabase
      .from("scorecard_parameters")
      .select("id, name, max_points, display_order")
      .eq("template_id", tpl.id)
      .order("display_order");
    if (pErr) throw new Response("Failed to load scorecard parameters", { status: 500 });
    return { template: tpl, parameters: params ?? [] };
  });

// ── Save feedback + scores atomically ──────────────────────────────────────
const ScoreSchema = z.object({
  parameter_name: z.string().min(1),
  max_points: z.number().min(0).max(100),
  selected_percentage: z.number().min(0).max(100),
  evaluator_note: z.string().max(1000).nullable().optional(),
});

const FeedbackPayload = z.object({
  id: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(4).max(200),
  agent_id: z.string().uuid(),
  category: z.string().min(1),
  feedback_type: z.enum(["positive", "constructive", "critical", "compliance", "coaching"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  interaction_type: z.enum(["chat", "case"]),
  interaction_reference: z.string().max(200).optional().nullable(),
  interaction_date: z.string().min(1),
  team_id: z.string().uuid().optional().nullable(),
  tags: z.array(z.string().max(50)).max(20).optional().default([]),
  summary: z.string().max(4000).optional().nullable(),
  strengths: z.string().max(4000).optional().nullable(),
  improvements: z.string().max(4000).optional().nullable(),
  recommended_actions: z.string().max(4000).optional().nullable(),
  internal_notes: z.string().max(4000).optional().nullable(),
  agent_visible_notes: z.string().max(4000).optional().nullable(),
  scores: z.array(ScoreSchema).min(1).max(30),
  mode: z.enum(["draft", "submit", "send"]),
});

export const saveFeedbackWithScores = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => FeedbackPayload.parse(raw))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify staff role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) =>
      ["super_admin", "qa_admin", "team_manager"].includes(r.role as string),
    );
    if (!isStaff) throw new Response("Forbidden", { status: 403 });

    // Recompute earned points server-side. Reject if the sum of max_points
    // doesn't match the active template (defends against tampered payloads).
    const overall = computeOverall(data.scores);
    if (Math.abs(overall.max - 100) > 0.01) {
      throw new Response("Scorecard weights must total 100", { status: 400 });
    }

    // Snapshot rows with server-computed earned_points.
    const scoreRows = data.scores.map((s, idx) => ({
      parameter_name: s.parameter_name,
      max_points: s.max_points,
      selected_percentage: s.selected_percentage,
      earned_points: computeEarnedPoints(s.max_points, s.selected_percentage),
      evaluator_note: s.evaluator_note ?? null,
      display_order: idx + 1,
    }));

    const status = (data.mode === "send"
      ? "ready_to_send"
      : data.mode === "submit"
        ? "submitted"
        : "draft") as "ready_to_send" | "submitted" | "draft";

    const basePayload = {
      title: data.title,
      agent_id: data.agent_id,
      category: data.category,
      feedback_type: data.feedback_type,
      severity: data.severity,
      status,
      interaction_type: data.interaction_type,
      interaction_reference: data.interaction_reference ?? null,
      interaction_date: data.interaction_date,
      evaluator_id: userId,
      team_id: data.team_id ?? null,
      tags: data.tags ?? [],
      summary: data.summary ?? null,
      strengths: data.strengths ?? null,
      improvements: data.improvements ?? null,
      recommended_actions: data.recommended_actions ?? null,
      internal_notes: data.internal_notes ?? null,
      agent_visible_notes: data.agent_visible_notes ?? null,
      overall_score: overall.earned,
      overall_percentage: overall.percentage,
      performance_label: labelFromPercentage(overall.percentage),
      score: overall.percentage,
    };

    let feedbackId: string;
    if (data.id) {
      const { error: uErr } = await supabase
        .from("feedback")
        .update(basePayload)
        .eq("id", data.id);
      if (uErr) throw new Response(uErr.message, { status: 400 });
      feedbackId = data.id;
      // Replace score rows
      await supabase.from("feedback_scores").delete().eq("feedback_id", feedbackId);
    } else {
      const { data: row, error: iErr } = await supabase
        .from("feedback")
        .insert({ ...basePayload, created_by: userId })
        .select("id")
        .single();
      if (iErr || !row) throw new Response(iErr?.message ?? "Failed to save", { status: 400 });
      feedbackId = row.id;
    }

    const { error: sErr } = await supabase
      .from("feedback_scores")
      .insert(scoreRows.map((r) => ({ ...r, feedback_id: feedbackId })));
    if (sErr) throw new Response(sErr.message, { status: 400 });

    return { id: feedbackId, overall };
  });

// ── Load feedback scores for detail view ───────────────────────────────────
export const getFeedbackScores = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ feedbackId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("feedback_scores")
      .select("parameter_name, max_points, selected_percentage, earned_points, evaluator_note, display_order")
      .eq("feedback_id", data.feedbackId)
      .order("display_order");
    if (error) throw new Response(error.message, { status: 500 });
    return rows ?? [];
  });
