import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_coaching_sessions",
  title: "List coaching sessions",
  description:
    "List coaching sessions visible to the signed-in user, optionally filtered by agent or status. Newest first.",
  inputSchema: {
    agent_id: z.string().uuid().optional(),
    status: z.string().optional().describe("Filter by session status."),
    limit: z.number().int().optional().describe("Max rows. Defaults to 25, hard cap 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ agent_id, status, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    let q = sb
      .from("coaching_sessions")
      .select(
        "id, agent_id, coach_id, feedback_id, topic, scheduled_at, duration_minutes, status, outcome, completed_at, created_at"
      )
      .order("scheduled_at", { ascending: false, nullsFirst: false })
      .limit(cap);
    if (agent_id) q = q.eq("agent_id", agent_id);
    if (status) q = q.eq("status", status);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { sessions: data ?? [] },
    };
  },
});
