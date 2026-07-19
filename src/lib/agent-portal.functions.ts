import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MY_FEEDBACK_LIMIT = 200;

function fail(message: string, status: number, err?: unknown): never {
  if (err) console.error(`[agent-portal] ${message}`, err);
  throw new Response(message, { status });
}

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
    if (error) fail("Unable to load roles", 500, error);
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
    if (error) fail("Unable to load agent record", 500, error);
    return data;
  });

/**
 * Feedback items visible to the signed-in agent. RLS restricts to
 * status IN (sent, acknowledged, completed) and their own agent row;
 * we also scope by agent_id defense-in-depth so a policy regression can't
 * leak another agent's feedback through this endpoint.
 */
export const listMyFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: agent, error: agentErr } = await context.supabase
      .from("agents")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (agentErr) fail("Unable to load agent record", 500, agentErr);
    if (!agent) return [];

    const { data, error } = await context.supabase
      .from("feedback")
      .select(
        "id, title, category, feedback_type, severity, status, score, due_date, sent_at, acknowledged_at, created_at",
      )
      .eq("agent_id", agent.id)
      .in("status", ["sent", "acknowledged", "completed"])
      .order("sent_at", { ascending: false, nullsFirst: false })
      .limit(MY_FEEDBACK_LIMIT);
    if (error) fail("Unable to load feedback", 500, error);
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
  .inputValidator((data: unknown) => AcknowledgeSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status, agent_id")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) fail("Unable to load feedback", 500, readErr);
    if (!fb) throw new Response("Feedback not found or not accessible", { status: 404 });
    if (!["sent", "acknowledged"].includes(fb.status as string)) {
      throw new Response(
        `Cannot acknowledge feedback in status "${fb.status}"`,
        { status: 409 },
      );
    }

    const now = new Date().toISOString();
    const fromStatus = fb.status as string;

    // Optimistic status guard so concurrent acks don't produce duplicate rows.
    const { data: updated, error: updErr } = await supabase
      .from("feedback")
      .update({
        status: "acknowledged",
        acknowledged_at: now,
        acknowledgement_note: data.note,
      })
      .eq("id", data.feedbackId)
      .in("status", ["sent", "acknowledged"])
      .select("id")
      .maybeSingle();
    if (updErr) fail("Unable to acknowledge feedback", 500, updErr);
    if (!updated) {
      throw new Response("Feedback status changed — please refresh", { status: 409 });
    }

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action: "acknowledge",
      from_status: fromStatus as any,
      to_status: "acknowledged" as any,
      comment: data.note,
      metadata: { source: "agent_portal" },
    });
    if (logErr) {
      // Audit failure should not roll back the acknowledgement itself.
      console.error("[agent-portal] audit log insert failed", logErr);
    }

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
  .inputValidator((data: unknown) => ClarifySchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) fail("Unable to load feedback", 500, readErr);
    if (!fb) throw new Response("Feedback not found or not accessible", { status: 404 });

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action: "clarification_requested",
      from_status: fb.status as any,
      to_status: fb.status as any,
      comment: data.note,
      metadata: { source: "agent_portal" },
    });
    if (logErr) fail("Unable to record clarification request", 500, logErr);

    return { ok: true as const };
  });

/**
 * Staff / reviewer marks an acknowledged feedback as completed. Writes an
 * audit log entry capturing the transition.
 */
export const completeFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) =>
    z.object({ feedbackId: z.string().uuid() }).parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) fail("Unable to load feedback", 500, readErr);
    if (!fb) throw new Response("Feedback not found or not accessible", { status: 404 });
    if (!["acknowledged", "completed"].includes(fb.status as string)) {
      throw new Response(
        `Cannot complete feedback in status "${fb.status}"`,
        { status: 409 },
      );
    }

    const fromStatus = fb.status as string;
    const { data: updated, error: updErr } = await supabase
      .from("feedback")
      .update({ status: "completed" })
      .eq("id", data.feedbackId)
      .in("status", ["acknowledged", "completed"])
      .select("id")
      .maybeSingle();
    if (updErr) fail("Unable to complete feedback", 500, updErr);
    if (!updated) {
      throw new Response("Feedback status changed — please refresh", { status: 409 });
    }

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action: "complete",
      from_status: fromStatus as any,
      to_status: "completed" as any,
      comment: "Marked complete",
      metadata: { source: "feedback_detail" },
    });
    if (logErr) console.error("[agent-portal] audit log insert failed", logErr);

    return { ok: true as const };
  });
