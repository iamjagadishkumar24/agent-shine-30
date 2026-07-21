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
// Individual agent detail with period filter
// ---------------------------------------------------------------------------
const DetailSchema = z.object({
  agentId: z.string().uuid(),
  from: z.string().optional(),
  to: z.string().optional(),
});
export const getAgentReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => DetailSchema.parse(d))
  .handler(async ({ data, context }) => {
    await requireStaff(context.supabase, context.userId);
    const { data: agent, error: aerr } = await context.supabase
      .from("agents").select("*").eq("id", data.agentId).maybeSingle();
    if (aerr || !agent) fail("Agent not found", 404, aerr);

    let q = context.supabase
      .from("feedback")
      .select("id, case_number, title, interaction_type, score, overall_percentage, status, acknowledgement_status, sent_at, acknowledged_at, created_at, summary, strengths, improvements, category")
      .eq("agent_id", data.agentId)
      .order("created_at", { ascending: false });
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);
    const { data: feedback, error: ferr } = await q;
    if (ferr) fail("Unable to load feedback", 500, ferr);

    // Parameter scores (period-scoped)
    const feedbackIds = (feedback ?? []).map((f) => f.id);
    let paramScores: any[] = [];
    if (feedbackIds.length) {
      const { data: ps } = await context.supabase
        .from("feedback_scores")
        .select("feedback_id, parameter_name, earned_points, max_points")
        .in("feedback_id", feedbackIds);
      paramScores = ps ?? [];
    }

    return { agent, feedback: feedback ?? [], paramScores };
  });
