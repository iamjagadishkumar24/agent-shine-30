import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertStaff(supabase: any, userId: string) {
  const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", userId);
  const ok = (roles ?? []).some((r: any) =>
    ["super_admin", "qa_admin", "team_manager"].includes(r.role as string),
  );
  if (!ok) throw new Response("Forbidden", { status: 403 });
}

export type AckRow = {
  id: string;
  case_number: string | null;
  title: string;
  status: string | null;
  agent_name: string | null;
  agent_email: string | null;
  acknowledgement_status: string | null;
  acknowledgement_due_at: string | null;
  acknowledged_at: string | null;
  sent_at: string | null;
  last_reminder_sent_at: string | null;
  reminder_count: number | null;
  agent_response_received_at: string | null;
};

export const listAcknowledgementFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        status: z.enum(["all", "pending", "acknowledged", "overdue", "response_received"]).default("all"),
        q: z.string().trim().max(200).optional(),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(raw ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    let query = supabase
      .from("feedback")
      .select(
        "id, case_number, title, status, acknowledgement_status, acknowledgement_due_at, acknowledged_at, sent_at, last_reminder_sent_at, reminder_count, agent_response_received_at, agent:agents(full_name, email)",
      )
      .not("case_number", "is", null)
      .order("sent_at", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(data.limit);

    if (data.status !== "all") {
      query = query.eq("acknowledgement_status", data.status);
    }
    if (data.q) {
      const like = `%${data.q}%`;
      query = query.or(`case_number.ilike.${like},title.ilike.${like}`);
    }

    const { data: rows, error } = await query;
    if (error) throw new Response(error.message, { status: 500 });

    return (rows ?? []).map((r: any): AckRow => ({
      id: r.id,
      case_number: r.case_number,
      title: r.title,
      status: r.status,
      agent_name: r.agent?.full_name ?? null,
      agent_email: r.agent?.email ?? null,
      acknowledgement_status: r.acknowledgement_status,
      acknowledgement_due_at: r.acknowledgement_due_at,
      acknowledged_at: r.acknowledged_at,
      sent_at: r.sent_at,
      last_reminder_sent_at: r.last_reminder_sent_at,
      reminder_count: r.reminder_count,
      agent_response_received_at: r.agent_response_received_at,
    }));
  });

export type AckHistory = {
  feedback: AckRow & {
    interaction_type: string | null;
    summary: string | null;
  };
  reminders: Array<{
    id: string;
    reminder_number: number;
    recipient_email: string;
    subject: string;
    delivery_status: string;
    failure_reason: string | null;
    sent_at: string;
  }>;
  responses: Array<{
    id: string;
    sender_email: string;
    subject: string;
    message_body: string;
    received_at: string;
  }>;
  events: Array<{ id: string; event_type: string; detail: any; created_at: string }>;
};

export const getAcknowledgementHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ feedbackId: z.string().uuid() }).parse(raw),
  )
  .handler(async ({ data, context }): Promise<AckHistory> => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    const [fbRes, remRes, respRes, evRes] = await Promise.all([
      supabase
        .from("feedback")
        .select(
          "id, case_number, title, status, acknowledgement_status, acknowledgement_due_at, acknowledged_at, sent_at, last_reminder_sent_at, reminder_count, agent_response_received_at, interaction_type, summary, agent:agents(full_name, email)",
        )
        .eq("id", data.feedbackId)
        .maybeSingle(),
      supabase
        .from("feedback_reminders")
        .select("id, reminder_number, recipient_email, subject, delivery_status, failure_reason, sent_at")
        .eq("feedback_id", data.feedbackId)
        .order("sent_at", { ascending: false }),
      supabase
        .from("feedback_email_responses")
        .select("id, sender_email, subject, message_body, received_at")
        .eq("feedback_id", data.feedbackId)
        .order("received_at", { ascending: false }),
      supabase
        .from("feedback_email_events")
        .select("id, event_type, detail, created_at")
        .eq("feedback_id", data.feedbackId)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

    if (fbRes.error || !fbRes.data) throw new Response("Not found", { status: 404 });
    const f: any = fbRes.data;

    return {
      feedback: {
        id: f.id,
        case_number: f.case_number,
        title: f.title,
        status: f.status,
        agent_name: f.agent?.full_name ?? null,
        agent_email: f.agent?.email ?? null,
        acknowledgement_status: f.acknowledgement_status,
        acknowledgement_due_at: f.acknowledgement_due_at,
        acknowledged_at: f.acknowledged_at,
        sent_at: f.sent_at,
        last_reminder_sent_at: f.last_reminder_sent_at,
        reminder_count: f.reminder_count,
        agent_response_received_at: f.agent_response_received_at,
        interaction_type: f.interaction_type,
        summary: f.summary,
      },
      reminders: (remRes.data ?? []) as any,
      responses: (respRes.data ?? []) as any,
      events: (evRes.data ?? []) as any,
    };
  });
