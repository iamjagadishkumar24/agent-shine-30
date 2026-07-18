import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

export default defineTool({
  name: "list_agents",
  title: "List agents",
  description:
    "List agents (support/sales/retention team members) visible to the signed-in user. Optionally filter by department, team, or a text search across name and email.",
  inputSchema: {
    department: z.string().optional().describe("Filter by department, e.g. 'Support'."),
    team: z.string().optional().describe("Filter by team name."),
    search: z.string().optional().describe("Case-insensitive match on full_name or email."),
    limit: z.number().int().optional().describe("Max rows to return. Defaults to 25, hard cap 100."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ department, team, search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);
    const cap = Math.min(Math.max(limit ?? 25, 1), 100);
    let q = sb
      .from("agents")
      .select("id, employee_id, full_name, email, department, team, manager_name, qa_score, status")
      .order("full_name")
      .limit(cap);
    if (department) q = q.eq("department", department);
    if (team) q = q.eq("team", team);
    if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: { agents: data ?? [] },
    };
  },
});
