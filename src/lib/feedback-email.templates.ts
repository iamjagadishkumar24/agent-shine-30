// Pure HTML email template. Client-safe.

export type FeedbackEmailData = {
  feedbackId: string;
  title: string;
  agentName: string;
  category: string;
  feedbackType: string;
  severity: string;
  score?: number | null;
  summary?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  recommendedActions?: string | null;
  dueDate?: string | null;
  reviewerName?: string | null;
  appBaseUrl: string;
  isReminder?: boolean;
  reminderCount?: number;
};

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const section = (title: string, body?: string | null) =>
  body
    ? `<tr><td style="padding:20px 32px 0;">
         <div style="font:600 11px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#71717a;">${escape(title)}</div>
         <div style="margin-top:6px;font:14px/1.65 -apple-system,Segoe UI,Roboto,sans-serif;color:#18181b;white-space:pre-wrap;">${escape(body)}</div>
       </td></tr>`
    : "";

const chip = (label: string, tone: "muted" | "accent" | "warn" = "muted") => {
  const tones = {
    muted: "background:#f4f4f5;color:#52525b;",
    accent: "background:#eef2ff;color:#4338ca;",
    warn: "background:#fef3c7;color:#92400e;",
  };
  return `<span style="display:inline-block;padding:3px 8px;border-radius:6px;font:500 11px/1 -apple-system,Segoe UI,Roboto,sans-serif;${tones[tone]}margin-right:6px;text-transform:capitalize;">${escape(label)}</span>`;
};

export function renderFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const ackUrl = `${d.appBaseUrl}/api/public/track/click/${d.feedbackId}?to=${encodeURIComponent(`/feedback/${d.feedbackId}`)}`;
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;
  const subject = d.isReminder
    ? `Reminder: Please acknowledge — ${d.title}`
    : `New feedback from QA — ${d.title}`;

  const banner = d.isReminder
    ? `<tr><td style="padding:16px 32px;background:#fff7ed;border-bottom:1px solid #fed7aa;">
         <div style="font:600 13px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#9a3412;">Reminder #${d.reminderCount ?? 1} — action required</div>
         <div style="margin-top:4px;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#9a3412;">This feedback is past its acknowledgement SLA. Please review and acknowledge below.</div>
       </td></tr>`
    : "";

  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escape(subject)}</title></head>
<body style="margin:0;padding:24px 12px;background:#fafafa;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e4e4e7;border-radius:14px;overflow:hidden;">
    <tr><td style="padding:24px 32px;background:#0a0a0a;color:#fafafa;">
      <div style="font:600 12px/1 -apple-system,Segoe UI,Roboto,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#a1a1aa;">Quality Assurance</div>
      <div style="margin-top:8px;font:600 22px/1.3 -apple-system,Segoe UI,Roboto,sans-serif;">${escape(d.title)}</div>
      <div style="margin-top:6px;font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#a1a1aa;">Prepared for ${escape(d.agentName)}${d.reviewerName ? ` · by ${escape(d.reviewerName)}` : ""}</div>
    </td></tr>
    ${banner}
    <tr><td style="padding:20px 32px 0;">
      ${chip(d.category, "muted")}${chip(d.feedbackType, "accent")}${chip(`Severity: ${d.severity}`, d.severity === "high" || d.severity === "critical" ? "warn" : "muted")}
      ${d.score != null ? chip(`Score ${Number(d.score).toFixed(1)}`, "accent") : ""}
    </td></tr>
    ${section("Summary", d.summary)}
    ${section("Strengths", d.strengths)}
    ${section("Areas to improve", d.improvements)}
    ${section("Recommended actions", d.recommendedActions)}
    ${d.dueDate ? `<tr><td style="padding:20px 32px 0;"><div style="font:13px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#52525b;">Please acknowledge by <strong style="color:#18181b;">${escape(d.dueDate)}</strong>.</div></td></tr>` : ""}
    <tr><td style="padding:28px 32px 32px;">
      <a href="${ackUrl}" style="display:inline-block;padding:12px 20px;background:#18181b;color:#fafafa;text-decoration:none;border-radius:8px;font:600 14px/1 -apple-system,Segoe UI,Roboto,sans-serif;">Review &amp; acknowledge</a>
      <div style="margin-top:16px;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#a1a1aa;">Or open: <a href="${ackUrl}" style="color:#4338ca;">${escape(`${d.appBaseUrl}/feedback/${d.feedbackId}`)}</a></div>
    </td></tr>
    <tr><td style="padding:16px 32px;background:#fafafa;border-top:1px solid #e4e4e7;font:12px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;color:#71717a;">
      This is an automated message from the QA platform. Acknowledgements are tracked for coaching and compliance.
    </td></tr>
  </table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;" />
</body></html>`;

  const text = [
    subject,
    "",
    `Agent: ${d.agentName}`,
    `Category: ${d.category} · Type: ${d.feedbackType} · Severity: ${d.severity}`,
    d.score != null ? `Score: ${Number(d.score).toFixed(1)}` : "",
    "",
    d.summary ? `Summary:\n${d.summary}\n` : "",
    d.strengths ? `Strengths:\n${d.strengths}\n` : "",
    d.improvements ? `Areas to improve:\n${d.improvements}\n` : "",
    d.recommendedActions ? `Recommended actions:\n${d.recommendedActions}\n` : "",
    d.dueDate ? `Please acknowledge by ${d.dueDate}.` : "",
    "",
    `Review & acknowledge: ${ackUrl}`,
  ].filter(Boolean).join("\n");

  return { subject, html, text };
}
