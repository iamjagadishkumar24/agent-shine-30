import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_feedback",
  title: "List feedback",
  description:
    "List feedback items visible to the signed-in user, newest first. Optionally filter by agent, status, or feedback type.",
  inputSchema: {
    agent_id: z.string().uuid().optional().describe("Filter to a single agent's feedback."),
    status: z
      .enum(["draft", "sent", "acknowledged", "completed", "archived"])
      .optional()
      .describe("Filter by workflow status."),
    feedback_type: z.string().optional().describe("Filter by feedback_type enum value."),
    limit: z.number().int().optional().describe("Max rows. Defaults to 25, hard cap 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ agent_id, status, feedback_type, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    let q = sb
      .from("feedback")
      .select(
        "id, title, agent_id, category, feedback_type, severity, status, score, due_date, sent_at, acknowledged_at, created_at"
      )
      .order("created_at", { ascending: false })
      .limit(cap);
    if (agent_id) q = q.eq("agent_id", agent_id);
    if (status) q = q.eq("status", status);
    if (feedback_type) q = q.eq("feedback_type", feedback_type);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { feedback: data ?? [] },
    };
  },
});
