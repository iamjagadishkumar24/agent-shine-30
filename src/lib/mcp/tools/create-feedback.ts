import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "create_feedback",
  title: "Create feedback draft",
  description:
    "Create a new feedback item in draft status for a given agent. The signed-in user becomes created_by. Use the workflow in the app UI to send or acknowledge it afterwards.",
  inputSchema: {
    agent_id: z.string().uuid().describe("Target agent UUID."),
    title: z.string().min(1).describe("Short headline."),
    summary: z.string().optional().describe("Detailed summary."),
    strengths: z.string().optional(),
    improvements: z.string().optional(),
    feedback_type: z
      .string()
      .optional()
      .describe("feedback_type enum value, e.g. positive/coaching/warning."),
    severity: z.string().optional().describe("feedback_severity enum value."),
    score: z.number().int().min(0).max(100).optional(),
    category: z.string().optional(),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const { data, error } = await sb
      .from("feedback")
      .insert({
        agent_id: input.agent_id,
        title: input.title,
        summary: input.summary ?? null,
        strengths: input.strengths ?? null,
        improvements: input.improvements ?? null,
        feedback_type: input.feedback_type ?? null,
        severity: input.severity ?? null,
        score: input.score ?? null,
        category: input.category ?? null,
        status: "draft",
        created_by: ctx.getUserId(),
      })
      .select()
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created feedback ${data?.id}` }],
      structuredContent: { feedback: data },
    };
  },
});
