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
  { key: "Customer_Name", label: "Customer name", description: "Person the email is addressed to (falls back to the agent).", sample: "Priya Ramanathan" },
  { key: "Agent_Name", label: "Support agent", description: "Agent under review.", sample: "Priya Ramanathan" },
  { key: "Manager_Name", label: "Reporting manager", description: "Agent's direct manager, if set.", sample: "Alex Chen" },
  { key: "Reviewer_Name", label: "Reviewer name", description: "QA reviewer who authored the feedback.", sample: "Jordan Miles" },
  { key: "Feedback_ID", label: "Feedback ID", description: "Short reference ID (first 8 chars).", sample: "A1B2C3D4" },
  { key: "Title", label: "Review title", description: "Short title of the review.", sample: "Customer escalation — Case 44821" },
  { key: "Department", label: "Department", description: "Business unit the agent belongs to.", sample: "Customer Success" },
  { key: "Category", label: "Category", description: "Feedback category.", sample: "Communication" },
  { key: "Feedback_Type", label: "Review type", description: "positive · constructive · corrective.", sample: "constructive" },
  { key: "Severity", label: "Severity", description: "low · medium · high · critical.", sample: "high" },
  { key: "Priority", label: "Priority", description: "Priority label shown on the summary card.", sample: "High" },
  { key: "Quality_Score", label: "Quality score", description: "Numeric QA score, rounded to 1 decimal.", sample: "82.5" },
  { key: "Overall_Score", label: "Overall score", description: "Alias of quality score.", sample: "82.5" },
  { key: "Overall_Rating", label: "Overall rating", description: "Rating label derived from the score.", sample: "Exceeds Expectations" },
  { key: "Review_Status", label: "Review status", description: "Current workflow status.", sample: "Ready for review" },
  { key: "Interaction_Date", label: "Interaction date", description: "Date of the customer interaction.", sample: "2026-07-18" },
  { key: "Review_Date", label: "Review date", description: "Date the review was completed.", sample: "2026-07-19" },
  { key: "Summary", label: "Performance summary", description: "Executive summary of the feedback.", sample: "The agent handled the escalation with empathy but missed two policy checkpoints." },
  { key: "Strengths", label: "Highlights", description: "What went well.", sample: "Strong empathy\nClear ownership of the resolution timeline" },
  { key: "Improvements", label: "Opportunities", description: "What to work on.", sample: "Confirm identity before disclosing account details\nTighten call summary notes" },
  { key: "Manager_Comments", label: "Manager's review", description: "Personalized narrative from the manager.", sample: "After carefully reviewing the interaction, we are pleased with the overall quality demonstrated." },
  { key: "Coaching_Recommendations", label: "Coaching focus areas", description: "Recommended coaching next steps.", sample: "Active Listening\nProduct Knowledge\nCustomer Empathy" },
  { key: "Next_Steps", label: "Next steps", description: "Clear actions for the recipient.", sample: "Acknowledge this review and complete the recommended coaching module by Friday." },
  { key: "Due_Date", label: "Acknowledgement due date", description: "SLA deadline for acknowledgement.", sample: "2026-07-25" },
  { key: "Acknowledge_URL", label: "Acknowledge URL", description: "Tracked click-through link for the recipient.", sample: "https://app.zenwork.com/feedback/…" },
  { key: "App_Base_URL", label: "App base URL", description: "Root URL of Zenwork Performance Manager.", sample: "https://app.zenwork.com" },
  { key: "Sender_Name", label: "Sender name", description: "Configured email sender name.", sample: "Zenwork Performance Manager" },
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
