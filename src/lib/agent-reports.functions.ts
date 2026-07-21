import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function fail(message: string, status = 400, err?: unknown): never {
  if (err) console.error(`[agent-reports] ${message}`, err);
  throw new Response(message, { status });
}

async function requireStaff(supabase: any, userId: string) {
  const roles = ["master_admin", "admin", "super_admin", "qa_admin", "qa_evaluator", "manager", "team_manager"];
  for (const r of roles) {
    const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: r });
    if (data) return;
  }
  fail("Staff access required", 403);
}

// ---------------------------------------------------------------------------
// Agent list with aggregate stats (all-time)
// ---------------------------------------------------------------------------
export const listAgentReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireStaff(context.supabase, context.userId);
    const [{ data: agents }, { data: feedback }] = await Promise.all([
      context.supabase.from("agents").select("id, full_name, email, employee_id, department, team, qa_score, status"),
      context.supabase.from("feedback")
        .select("id, agent_id, interaction_type, score, acknowledgement_status, sent_at, acknowledged_at, created_at, status")
        .not("agent_id", "is", null),
    ]);

    const A = (agents ?? []) as any[];
    const F = (feedback ?? []) as any[];
    const byAgent = new Map<string, any[]>();
    for (const f of F) {
      if (!byAgent.has(f.agent_id)) byAgent.set(f.agent_id, []);
      byAgent.get(f.agent_id)!.push(f);
    }

    return A.map((a) => {
      const fs = byAgent.get(a.id) ?? [];
      const scores = fs.map((f) => f.score).filter((s: any) => typeof s === "number");
      const ackd = fs.filter((f) => f.acknowledgement_status === "acknowledged" || f.acknowledged_at).length;
      const pending = fs.filter((f) => f.sent_at && !f.acknowledged_at && f.acknowledgement_status !== "acknowledged").length;
      const chat = fs.filter((f) => f.interaction_type === "chat").length;
      const cases = fs.filter((f) => f.interaction_type === "case").length;
      const last = fs.map((f) => f.sent_at || f.created_at).filter(Boolean).sort().reverse()[0] ?? null;
      return {
        id: a.id,
        full_name: a.full_name,
        email: a.email,
        employee_id: a.employee_id,
        department: a.department,
        team: a.team,
        status: a.status,
        qa_score: a.qa_score,
        total_feedback: fs.length,
        avg_score: scores.length ? Math.round((scores.reduce((s: number, n: number) => s + n, 0) / scores.length) * 10) / 10 : null,
        highest_score: scores.length ? Math.max(...scores) : null,
        lowest_score: scores.length ? Math.min(...scores) : null,
        acknowledged_count: ackd,
        pending_count: pending,
        chat_count: chat,
        case_count: cases,
        last_feedback_at: last,
      };
    }).sort((a, b) => (a.full_name ?? "").localeCompare(b.full_name ?? ""));
  });

// ---------------------------------------------------------------------------
// Agent detail summary — aggregate stats + trend + parameter averages
// ---------------------------------------------------------------------------
const SummarySchema = z.object({
  agentId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export const getAgentReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SummarySchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: agent, error: aerr } = await context.supabase
      .from("agents").select("*").eq("id", data.agentId).maybeSingle();
    if (aerr || !agent) fail("Agent not found", 404, aerr);

    let q = context.supabase
      .from("feedback")
      .select("id, score, interaction_type, acknowledgement_status, sent_at, acknowledged_at, created_at")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: feedback, error: ferr } = await q;
    if (ferr) fail("Unable to load feedback", 500, ferr);
    const F = (feedback ?? []) as any[];

    const scores = F.map((f) => f.score).filter((s: any) => typeof s === "number");
    const ackd = F.filter((f) => f.acknowledgement_status === "acknowledged" || f.acknowledged_at).length;
    const pending = F.filter((f) => f.sent_at && !f.acknowledged_at && f.acknowledgement_status !== "acknowledged").length;
    const chat = F.filter((f) => f.interaction_type === "chat").length;
    const cases = F.filter((f) => f.interaction_type === "case").length;
    const stats = {
      total: F.length,
      avg: scores.length ? Math.round((scores.reduce((s, n) => s + n, 0) / scores.length) * 10) / 10 : null,
      high: scores.length ? Math.max(...scores) : null,
      low: scores.length ? Math.min(...scores) : null,
      ackd, pending, chat, cases,
      first: F.length ? F[F.length - 1].created_at : null,
      last: F.length ? F[0].created_at : null,
    };

    const trend = [...F].reverse().map((f) => ({ date: f.created_at, score: f.score ?? 0 }));

    let paramAvg: Array<{ name: string; avg: number; max: number }> = [];
    if (F.length) {
      const ids = F.map((f) => f.id);
      const { data: ps } = await context.supabase
        .from("feedback_scores")
        .select("feedback_id, parameter_name, earned_points, max_points")
        .in("feedback_id", ids);
      const acc = new Map<string, { earned: number; max: number; count: number }>();
      for (const p of (ps ?? []) as any[]) {
        const cur = acc.get(p.parameter_name) ?? { earned: 0, max: 0, count: 0 };
        cur.earned += Number(p.earned_points) || 0;
        cur.max += Number(p.max_points) || 0;
        cur.count += 1;
        acc.set(p.parameter_name, cur);
      }
      paramAvg = Array.from(acc.entries()).map(([name, v]) => ({
        name,
        avg: v.count ? Math.round((v.earned / v.count) * 10) / 10 : 0,
        max: v.count ? Math.round((v.max / v.count) * 10) / 10 : 0,
      }));
    }

    return { agent, stats, trend, paramAvg };
  });

// ---------------------------------------------------------------------------
// Paginated + filtered feedback history for one agent
// ---------------------------------------------------------------------------
const FeedbackListSchema = z.object({
  agentId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  ackStatus: z.string().optional(),
  interactionType: z.enum(["chat", "case"]).optional(),
  minScore: z.number().min(0).max(100).optional(),
  maxScore: z.number().min(0).max(100).optional(),
  sortBy: z.enum(["created_at", "sent_at", "score", "case_number", "title"]).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export const listAgentReportFeedback = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => FeedbackListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);

    const from = (data.page - 1) * data.pageSize;
    const to = from + data.pageSize - 1;

    let q = context.supabase
      .from("feedback")
      .select(
        "id, case_number, title, interaction_type, score, overall_percentage, status, acknowledgement_status, sent_at, delivered_at, acknowledged_at, opened_at, created_at, category",
        { count: "exact" }
      )
      .eq("agent_id", data.agentId);

    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    if (data.status) q = q.eq("status", data.status);
    if (data.ackStatus) q = q.eq("acknowledgement_status", data.ackStatus);
    if (data.interactionType) q = q.eq("interaction_type", data.interactionType);
    if (typeof data.minScore === "number") q = q.gte("score", data.minScore);
    if (typeof data.maxScore === "number") q = q.lte("score", data.maxScore);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ");
      q = q.or(`title.ilike.%${s}%,case_number.ilike.%${s}%,category.ilike.%${s}%`);
    }

    q = q.order(data.sortBy, { ascending: data.sortDir === "asc", nullsFirst: false }).range(from, to);

    const { data: rows, count, error } = await q;
    if (error) fail("Unable to load feedback", 500, error);

    return {
      rows: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / data.pageSize)),
    };
  });

// ---------------------------------------------------------------------------
// Paginated email delivery history for one agent
// ---------------------------------------------------------------------------
const EmailListSchema = z.object({
  agentId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
  search: z.string().trim().max(200).optional(),
  status: z.string().optional(),
  sortBy: z.enum(["created_at", "sent_at", "delivered_at", "status"]).default("created_at"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(20),
});
export const listAgentFeedbackEmails = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => EmailListSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);

    // Restrict to this agent's feedback IDs
    let fq = context.supabase.from("feedback").select("id").eq("agent_id", data.agentId);
    if (data.from) fq = fq.gte("created_at", data.from);
    if (data.to) fq = fq.lte("created_at", data.to);
    const { data: fbIds, error: fberr } = await fq;
    if (fberr) fail("Unable to scope emails", 500, fberr);
    const ids = (fbIds ?? []).map((r: any) => r.id);
    if (!ids.length) {
      return { rows: [], total: 0, page: data.page, pageSize: data.pageSize, totalPages: 1 };
    }

    const rangeFrom = (data.page - 1) * data.pageSize;
    const rangeTo = rangeFrom + data.pageSize - 1;

    let q = context.supabase
      .from("email_queue")
      .select(
        "id, feedback_id, kind, to_email, subject, status, attempts, max_attempts, provider, provider_message_id, provider_status, last_error, sent_at, delivered_at, bounced_at, bounce_reason, next_attempt_at, created_at",
        { count: "exact" }
      )
      .in("feedback_id", ids);

    if (data.status) q = q.eq("status", data.status);
    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ");
      q = q.or(`subject.ilike.%${s}%,to_email.ilike.%${s}%,provider_message_id.ilike.%${s}%`);
    }

    q = q.order(data.sortBy, { ascending: data.sortDir === "asc", nullsFirst: false }).range(rangeFrom, rangeTo);

    const { data: rows, count, error } = await q;
    if (error) fail("Unable to load emails", 500, error);

    return {
      rows: rows ?? [],
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
      totalPages: Math.max(1, Math.ceil((count ?? 0) / data.pageSize)),
    };
  });
