import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Roles for the signed-in user. Used by the layout to decide whether to
 * render the staff sidebar or the agent portal shell.
 */
export const getMyRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.role as string);
  });

/**
 * The agent record linked to the signed-in user, if any.
 */
export const getMyAgent = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("agents")
      .select("*")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

/**
 * Feedback items visible to the signed-in agent. RLS restricts to
 * status IN (sent, acknowledged, completed) and their own agent row.
 */
export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("feedback")
      .select("id, title, category, feedback_type, severity, status, score, due_date, sent_at, acknowledged_at, created_at")
      .order("sent_at", { ascending: false, nullsFirst: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const AcknowledgeSchema = z.object({
  feedbackId: z.string().uuid(),
  note: z.string().trim().min(1, "Please add a short acknowledgement note").max(2000),
});

/**
 * Agent acknowledges their own feedback. RLS enforces ownership; we also
 * assert status is sent (or already acknowledged for re-ack) to keep the
 * state machine tidy. Writes an audit log entry.
 */
export const acknowledgeFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => AcknowledgeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status, agent_id")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!fb) throw new Error("Feedback not found or not accessible");
    if (!["sent", "acknowledged"].includes(fb.status as string)) {
      throw new Error(`Cannot acknowledge feedback in status "${fb.status}"`);
    }

    const now = new Date().toISOString();
    const fromStatus = fb.status as string;

    const { error: updErr } = await supabase
      .from("feedback")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
        acknowledgement_note: data.note,
      })
      .eq("id", data.feedbackId);
    if (updErr) throw new Error(updErr.message);

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action: "acknowledge",
      from_status: fromStatus as any,
      to_status: "acknowledged" as any,
      comment: data.note,
      metadata: { source: "agent_portal" },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true as const };
  });

const ClarifySchema = z.object({
  feedbackId: z.string().uuid(),
  note: z.string().trim().min(1, "Describe what needs clarification").max(2000),
});

/**
 * Agent requests clarification on their feedback. Records an audit log
 * entry without changing status; reviewers see it in the timeline.
 */
export const requestClarification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => ClarifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) throw new Error(readErr.message);
    if (!fb) throw new Error("Feedback not found or not accessible");

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action: "clarification_requested",
      from_status: fb.status as any,
      to_status: fb.status as any,
      comment: data.note,
      metadata: { source: "agent_portal" },
    });
    if (logErr) throw new Error(logErr.message);

    return { ok: true as const };
  });
