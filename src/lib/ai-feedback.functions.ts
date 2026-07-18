import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText, Output, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const InputSchema = z.object({
  agent_id: z.string().uuid(),
  category: z.string().min(1),
  feedback_type: z.enum(["positive", "constructive", "critical", "compliance", "coaching"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  observations: z.string().trim().min(10).max(4000),
  score: z.number().min(0).max(100).nullable().optional(),
});

const DraftSchema = z.object({
  title: z.string(),
  summary: z.string(),
  strengths: z.string(),
  improvements: z.string(),
  recommended_actions: z.string(),
});

export const generateFeedbackDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Verify staff role — agents must not use this
    const { supabase, userId } = context;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const isStaff = (roles ?? []).some((r) =>
      ["qa_admin", "qa_reviewer", "team_lead", "manager"].includes(r.role as string),
    );
    if (!isStaff) throw new Error("Forbidden");

    const { data: agent } = await supabase
      .from("agents")
      .select("full_name, department")
      .eq("id", data.agent_id)
      .maybeSingle();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "You are a senior QA coach writing agent feedback for an enterprise contact center.",
      "Tone: professional, empathetic, specific, action-oriented. No fluff, no clichés.",
      "Write each field as plain prose (no markdown headings). Keep each section under 120 words.",
      "Never invent facts the observer didn't mention. If a section has no basis, keep it short and honest.",
    ].join(" ");

    const prompt = [
      `Agent: ${agent?.full_name ?? "(unknown)"} in ${agent?.department ?? ""}`.trim(),
      `Category: ${data.category}`,
      `Feedback type: ${data.feedback_type}`,
      `Severity: ${data.severity}`,
      data.score != null ? `QA score: ${data.score}/100` : "",
      "",
      "Reviewer observations:",
      data.observations,
      "",
      "Produce a structured feedback draft with fields: title (short, <=90 chars), summary (1 paragraph), strengths, improvements, recommended_actions.",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      const { output } = await generateText({
        model,
        system,
        prompt,
        output: Output.object({ schema: DraftSchema }),
      });
      return output;
    } catch (error) {
      if (NoObjectGeneratedError.isInstance(error)) {
        // Fallback: return observations as summary so the user isn't blocked
        return {
          title: `${data.category} feedback`,
          summary: data.observations,
          strengths: "",
          improvements: "",
          recommended_actions: "",
        };
      }
      throw error;
    }
  });
