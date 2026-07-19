import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateObject, NoObjectGeneratedError } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

export const EMAIL_TEMPLATES = [
  "performance_feedback",
  "coaching_invitation",
  "performance_improvement_plan",
  "recognition",
  "monthly_summary",
  "weekly_feedback",
  "quality_review",
  "follow_up",
  "reminder",
  "escalation",
] as const;
export type EmailTemplate = (typeof EMAIL_TEMPLATES)[number];

const TEMPLATE_GUIDANCE: Record<EmailTemplate, string> = {
  performance_feedback: "Standard structured performance feedback. Balanced tone. Cover strengths and improvements evenly.",
  coaching_invitation: "Invite the agent to a coaching session. Warm, supportive, forward-looking. Frame improvements as coaching topics.",
  performance_improvement_plan: "Formal PIP notice. Direct, respectful, unambiguous about expectations and timelines. Recommended actions must be SMART.",
  recognition: "Recognition and appreciation. Celebratory, specific, energizing. Improvements section should be a light 'even better if' or empty.",
  monthly_summary: "Monthly performance summary. Concise executive tone, trends over the month, forward look.",
  weekly_feedback: "Short weekly feedback. Focused on 1-2 items per section. Casual professional.",
  quality_review: "Quality review results. Score-driven, evidence-based, cite the observations.",
  follow_up: "Follow-up on prior feedback. Reference progress since last review; short and actionable.",
  reminder: "Gentle reminder about outstanding acknowledgement/action items. Polite, brief.",
  escalation: "Escalation notice. Formal, firm, clear consequences and next steps. No fluff.",
};

const InputSchema = z.object({
  agent_id: z.string().uuid(),
  category: z.string().min(1),
  feedback_type: z.enum(["positive", "constructive", "critical", "compliance", "coaching"]),
  severity: z.enum(["low", "medium", "high", "critical"]),
  observations: z.string().trim().min(10).max(4000),
  score: z.number().min(0).max(100).nullable().optional(),
  template: z.enum(EMAIL_TEMPLATES).default("performance_feedback"),
});

const DraftSchema = z.object({
  title: z.string(),
  summary: z.string(),
  strengths: z.string(),
  improvements: z.string(),
  recommended_actions: z.string(),
});

const clamp = (s: unknown, max: number) =>
  typeof s === "string" ? s.trim().slice(0, max) : "";

export const generateFeedbackDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => InputSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Verify staff role — agents must not use this
    const { supabase, userId } = context;
    const { data: roles, error: rolesError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesError) {
      throw new Response("Failed to verify permissions", { status: 500 });
    }
    const isStaff = (roles ?? []).some((r) =>
      ["super_admin", "qa_admin", "team_manager"].includes(r.role as string),
    );
    if (!isStaff) throw new Response("Forbidden", { status: 403 });

    const { data: agent } = await supabase
      .from("agents")
      .select("full_name, department")
      .eq("id", data.agent_id)
      .maybeSingle();

    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Response("AI service is not configured", { status: 503 });

    const gateway = createLovableAiGatewayProvider(key, {
      structuredOutputs: true,
    });
    const model = gateway("google/gemini-3-flash-preview");

    const system = [
      "You are a senior Customer Success coach writing agent feedback for an enterprise contact center.",
      "Tone: professional, empathetic, specific, action-oriented. No fluff, no clichés.",
      "Write each field as plain prose (no markdown headings). Keep each section under 120 words.",
      "Never invent facts the observer didn't mention. If a section has no basis, keep it short and honest.",
      "Always return every field as a non-empty string; if a section truly has no material, write a single sentence acknowledging that.",
      `Template guidance: ${TEMPLATE_GUIDANCE[data.template]}`,
    ].join(" ");

    const agentName = clamp(agent?.full_name, 120) || "(unknown)";
    const agentDept = clamp(agent?.department, 120);

    const prompt = [
      `Agent: ${agentName}${agentDept ? ` in ${agentDept}` : ""}`,
      `Category: ${data.category}`,
      `Feedback type: ${data.feedback_type}`,
      `Severity: ${data.severity}`,
      data.score != null ? `Quality score: ${data.score}/100` : "",
      "",
      "Reviewer observations:",
      data.observations,
      "",
      "Produce a structured feedback draft as JSON with fields: title (short, <=90 chars), summary (1 paragraph), strengths, improvements, recommended_actions.",
    ]
      .filter(Boolean)
      .join("\n");

    // Bound the upstream call — a hung model must not stall the request forever.
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), 25_000);

    try {
      const { object } = await generateObject({
        model,
        system,
        prompt,
        schema: DraftSchema,
        abortSignal: abort.signal,
      });
      return {
        title: clamp(object.title, 120),
        summary: clamp(object.summary, 2000),
        strengths: clamp(object.strengths, 1500),
        improvements: clamp(object.improvements, 1500),
        recommended_actions: clamp(object.recommended_actions, 1500),
      };
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new Response("AI request timed out. Try again.", { status: 504 });
      }
      if (NoObjectGeneratedError.isInstance(error)) {
        // Model returned unparseable output. Try to salvage from error.text
        // (raw provider text captured by the SDK) rather than silently
        // returning empty fields. Surface the failure so the UI can retry.
        const raw = typeof (error as { text?: unknown }).text === "string"
          ? (error as { text: string }).text
          : "";
        console.error("[ai-feedback] Structured output parse failed", {
          template: data.template,
          rawPreview: raw.slice(0, 400),
        });
        throw new Response(
          "AI couldn't produce a structured draft. Try again or shorten your observations.",
          { status: 502 },
        );
      }
      console.error("[ai-feedback] Draft generation failed", error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  });
