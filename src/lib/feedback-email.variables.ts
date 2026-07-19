// Client- and server-safe: variables system for the QA feedback email template.
// Kept separate from the default renderer so the settings UI can import it.

import type { FeedbackEmailData } from "./feedback-email.templates";

export type TemplateVariable = {
  key: string;
  label: string;
  description: string;
  sample: string;
};

// The canonical set of variables an admin can reference in a custom
// feedback-email template. Keep in sync with buildVariableMap().
export const FEEDBACK_TEMPLATE_VARIABLES: TemplateVariable[] = [
  { key: "agentName", label: "Agent name", description: "Full name of the agent receiving feedback.", sample: "Priya Ramanathan" },
  { key: "managerName", label: "Manager name", description: "Direct manager, if set.", sample: "Alex Chen" },
  { key: "reviewerName", label: "Reviewer name", description: "QA reviewer who authored the feedback.", sample: "Jordan Miles" },
  { key: "title", label: "Feedback title", description: "Short title of the feedback.", sample: "Customer escalation — Case 44821" },
  { key: "category", label: "Category", description: "Feedback category.", sample: "Communication" },
  { key: "feedbackType", label: "Feedback type", description: "positive · constructive · corrective.", sample: "constructive" },
  { key: "severity", label: "Severity", description: "low · medium · high · critical.", sample: "high" },
  { key: "score", label: "Score", description: "Numeric QA score, rounded to 1 decimal.", sample: "82.5" },
  { key: "summary", label: "Summary", description: "Executive summary of the feedback.", sample: "The agent handled the escalation with empathy but missed two policy checkpoints." },
  { key: "strengths", label: "Strengths", description: "What went well.", sample: "Strong empathy, clear ownership of the resolution timeline." },
  { key: "improvements", label: "Areas to improve", description: "What to work on.", sample: "Confirm identity before disclosing account details." },
  { key: "recommendedActions", label: "Coaching actions", description: "Recommended coaching next steps.", sample: "Complete the Identity Verification refresher module by Friday." },
  { key: "dueDate", label: "Acknowledgement due date", description: "SLA deadline for acknowledgement.", sample: "2026-07-25" },
  { key: "acknowledgeUrl", label: "Acknowledge URL", description: "Tracked click-through link for the agent.", sample: "https://app.example.com/feedback/…/ack" },
  { key: "appBaseUrl", label: "App base URL", description: "Root URL of the QA platform.", sample: "https://app.example.com" },
  { key: "senderName", label: "Sender name", description: "Configured email sender name.", sample: "QA Team" },
];

export type FeedbackEmailVariables = Partial<FeedbackEmailData> & {
  acknowledgeUrl?: string;
};

// Build the `{{key}}` → value map used when interpolating a custom template.
export function buildVariableMap(d: FeedbackEmailVariables): Record<string, string> {
  const appBaseUrl = (d.appBaseUrl ?? "").replace(/\/$/, "");
  const acknowledgeUrl =
    d.acknowledgeUrl ??
    (d.feedbackId ? `${appBaseUrl}/api/public/track/click/${d.feedbackId}?to=${encodeURIComponent(`/feedback/${d.feedbackId}`)}` : "");
  return {
    agentName: d.agentName ?? "",
    managerName: d.managerName ?? "",
    reviewerName: d.reviewerName ?? "",
    title: d.title ?? "",
    category: d.category ?? "",
    feedbackType: d.feedbackType ?? "",
    severity: d.severity ?? "",
    score: d.score != null ? Number(d.score).toFixed(1) : "",
    summary: d.summary ?? "",
    strengths: d.strengths ?? "",
    improvements: d.improvements ?? "",
    recommendedActions: d.recommendedActions ?? "",
    dueDate: d.dueDate ?? "",
    acknowledgeUrl,
    appBaseUrl,
    senderName: d.senderName ?? "",
  };
}

// Build a sample variable set for the preview pane / test emails.
export function sampleVariableMap(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const v of FEEDBACK_TEMPLATE_VARIABLES) map[v.key] = v.sample;
  return map;
}

// Interpolate `{{key}}` tokens in a template string. Unknown keys are left blank
// so a typo in the template doesn't leak literal `{{foo}}` into a customer email.
// `escapeFn` optionally escapes each replaced value (for HTML contexts).
export function interpolate(
  template: string,
  vars: Record<string, string>,
  escapeFn?: (v: string) => string,
): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_m, key: string) => {
    const raw = Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : "";
    return escapeFn ? escapeFn(raw) : raw;
  });
}

const htmlEscape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

// Render a custom template (subject + html + optional text) with the given
// variables. Subject and text are interpolated raw (no HTML escaping);
// HTML values are escaped so untrusted content can't inject markup.
export function renderCustomTemplate(
  template: { subject: string; html: string; text?: string | null },
  vars: Record<string, string>,
): { subject: string; html: string; text: string } {
  return {
    subject: interpolate(template.subject, vars).slice(0, 300).trim(),
    html: interpolate(template.html, vars, htmlEscape),
    text: interpolate(template.text ?? "", vars),
  };
}
