// Pure HTML email template — client-safe (no server imports).
// Simplified QualiPulse feedback email: compact, mobile-friendly, no marketing.

import { BRAND, QUALITY_PARAMETERS, computeOverallScore } from "./brand";

export type FeedbackEmailAttachmentLink = { fileName: string; url: string };
export type FeedbackMetric = { label: string; score: number };

export type FeedbackEmailData = {
  feedbackId: string;
  title: string;
  agentName: string;
  category?: string;
  feedbackType?: string;
  severity?: string;
  interactionType?: string | null;   // "chat" | "case"
  score?: number | null;
  summary?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  recommendedActions?: string | null;
  dueDate?: string | null;
  reviewerName?: string | null;
  managerName?: string | null;
  appBaseUrl: string;
  isReminder?: boolean;
  reminderCount?: number;
  // Branding overrides
  senderName?: string;
  logoUrl?: string | null;
  signatureHtml?: string | null;
  confidentialityNotice?: string | null;
  attachmentLinks?: FeedbackEmailAttachmentLink[];
  // Per-parameter scores. Order/labels are canonicalized against QUALITY_PARAMETERS.
  metrics?: FeedbackMetric[] | null;
  // Ignored legacy fields (kept for API compatibility)
  customerName?: string | null;
  department?: string | null;
  interactionDate?: string | null;
  reviewDate?: string | null;
  overallRating?: string | null;
  priority?: string | null;
  reviewStatus?: string | null;
  managerComments?: string | null;
  managerTitle?: string | null;
  nextSteps?: string | null;
  reviewPeriodStart?: string | null;
  reviewPeriodEnd?: string | null;
};

const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif`;
const INK = "#0f172a";
const INK_SOFT = "#334155";
const MUTE = "#64748b";
const LINE = "#e5e7eb";
const ACCENT = "#4f46e5";
const PAGE = "#f4f6f8";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const firstName = (full: string) => full.split(/\s+/)[0] || full;

// Normalize per-parameter scores to the canonical seven, preserving order.
function normalizeMetrics(input?: FeedbackMetric[] | null): FeedbackMetric[] {
  const byKey = new Map<string, number>();
  for (const m of input ?? []) {
    const k = m.label.trim().toLowerCase();
    if (typeof m.score === "number" && !Number.isNaN(m.score)) byKey.set(k, m.score);
  }
  const out: FeedbackMetric[] = [];
  for (const label of QUALITY_PARAMETERS) {
    const key = label.toLowerCase();
    if (byKey.has(key)) out.push({ label, score: Math.max(0, Math.min(100, byKey.get(key)!)) });
  }
  return out;
}

function formatPct(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function scoreColor(n: number): string {
  if (n >= 90) return "#047857";
  if (n >= 80) return "#1d4ed8";
  if (n >= 70) return "#a16207";
  return "#b91c1c";
}

function narrativeBlock(title: string, body: string | null | undefined): string {
  const text = (body ?? "").trim();
  if (!text) return "";
  return `
    <tr><td style="padding:8px 24px 4px;">
      <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:6px;">${escape(title)}</div>
      <div style="font:14.5px/1.65 ${FONT};color:${INK};white-space:pre-wrap;">${escape(text)}</div>
    </td></tr>`;
}

export function renderFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const metrics = normalizeMetrics(d.metrics);
  const overallFromMetrics = metrics.length ? computeOverallScore(metrics.map((m) => m.score)) : null;
  const overall = overallFromMetrics ?? (typeof d.score === "number" ? d.score : null);
  const overallLabel = overall != null ? formatPct(overall) : "—";

  const interactionRaw = (d.interactionType ?? "").toLowerCase();
  const interactionLabel = interactionRaw === "case" ? "Case" : interactionRaw === "chat" ? "Chat" : "interaction";

  const senderName = d.senderName ?? BRAND.senderName;
  const isReminder = !!d.isReminder;
  const subject = isReminder
    ? `Reminder: Quality Feedback – ${d.title}`
    : `Quality Feedback – ${d.title}`;

  const greetingName = firstName(d.agentName);
  const ackUrl = `${d.appBaseUrl}/api/public/track/click/${d.feedbackId}?to=${encodeURIComponent(`/portal/${d.feedbackId}`)}`;
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;

  const logoImg = d.logoUrl
    ? `<img src="${escape(d.logoUrl)}" alt="${escape(BRAND.name)}" height="40" style="display:block;height:40px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none;" />`
    : `<div style="font:800 22px/1 ${FONT};color:${INK};letter-spacing:.04em;">${escape(BRAND.name)}</div>`;

  const metricsRows = metrics
    .map((m) => {
      const pct = formatPct(m.score);
      const color = scoreColor(m.score);
      return `
        <tr>
          <td style="padding:9px 0;font:14px/1.4 ${FONT};color:${INK};">
            <span style="display:inline-block;width:16px;color:#059669;font-weight:700;">&#10003;</span>
            ${escape(m.label)}
          </td>
          <td align="right" style="padding:9px 0;font:700 14px/1.4 ${FONT};color:${color};white-space:nowrap;">${pct}</td>
        </tr>`;
    })
    .join("");

  const metricsBlock = metrics.length
    ? `
      <tr><td style="padding:8px 24px 4px;">
        <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:6px;">Quality Evaluation</div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${metricsRows}</table>
      </td></tr>`
    : "";

  const reminderBanner = isReminder
    ? `<tr><td style="padding:0 24px 8px;">
        <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-left:3px solid #ea580c;border-radius:8px;font:600 13px/1.4 ${FONT};color:#9a3412;">
          Reminder${d.reminderCount ? ` #${d.reminderCount}` : ""} — please acknowledge this feedback.
        </div>
      </td></tr>`
    : "";

  const attachmentsBlock = (d.attachmentLinks ?? []).length
    ? `<tr><td style="padding:8px 24px 4px;">
        <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:6px;">Attachments</div>
        ${(d.attachmentLinks ?? [])
          .map(
            (a) =>
              `<a href="${escape(a.url)}" style="display:inline-block;margin:0 6px 6px 0;padding:8px 12px;border:1px solid ${LINE};border-radius:8px;background:#f8fafc;color:${INK};text-decoration:none;font:600 12.5px/1 ${FONT};">📎 ${escape(a.fileName)}</a>`,
          )
          .join("")}
      </td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <title>${escape(subject)}</title>
  <style>
    @media only screen and (max-width:620px){
      .container{width:100% !important;border-radius:0 !important;}
      .px{padding-left:16px !important;padding-right:16px !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Quality Feedback – ${escape(d.title)} · Overall ${escape(overallLabel)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,.06);">

        <tr><td class="px" style="padding:22px 24px 8px;border-bottom:1px solid ${LINE};">
          ${logoImg}
        </td></tr>

        ${reminderBanner}

        <tr><td class="px" style="padding:18px 24px 4px;">
          <div style="font:600 16px/1.5 ${FONT};color:${INK};">Hello ${escape(greetingName)},</div>
          <div style="margin-top:8px;font:14.5px/1.65 ${FONT};color:${INK_SOFT};">
            A quality evaluation has been completed for your recent ${escape(interactionLabel)} interaction.
          </div>
        </td></tr>

        <tr><td class="px" style="padding:16px 24px 4px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#eef2ff,#ffffff);border:1px solid ${LINE};border-radius:12px;">
            <tr><td align="center" style="padding:18px 16px;">
              <div style="font:700 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};">Overall Quality Score</div>
              <div style="margin-top:8px;font:800 34px/1 ${FONT};color:${overall != null ? scoreColor(overall) : INK};">${escape(overallLabel)}</div>
            </td></tr>
          </table>
        </td></tr>

        ${metricsBlock}

        ${narrativeBlock("Summary", d.summary)}
        ${narrativeBlock("Strengths", d.strengths)}
        ${narrativeBlock("Areas to Improve", d.improvements)}
        ${narrativeBlock("Recommended Actions", d.recommendedActions)}
        ${attachmentsBlock}

        <tr><td class="px" align="center" style="padding:18px 24px 6px;">
          <a href="${ackUrl}" style="display:inline-block;padding:12px 22px;background:${ACCENT};color:#ffffff;text-decoration:none;border-radius:10px;font:700 14px/1 ${FONT};">Open in QualiPulse</a>
        </td></tr>

        <tr><td class="px" style="padding:18px 24px 22px;border-top:1px solid ${LINE};">
          <div style="font:14.5px/1.6 ${FONT};color:${INK};">Regards,</div>
          <div style="margin-top:2px;font:700 14.5px/1.6 ${FONT};color:${INK};">${escape(BRAND.name)} Team</div>
          <div style="margin-top:2px;font:13px/1.6 ${FONT};color:${MUTE};">${escape(BRAND.tagline)}</div>
        </td></tr>

      </table>
      <div style="max-width:640px;margin:12px auto 0;padding:0 12px;font:11.5px/1.5 ${FONT};color:${MUTE};text-align:center;">
        This is an automated message from ${escape(BRAND.name)}. Please do not reply directly.
        ${d.confidentialityNotice ? `<div style="margin-top:6px;font-style:italic;">${escape(d.confidentialityNotice)}</div>` : ""}
      </div>
    </td></tr>
  </table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />
</body>
</html>`;

  // ── Plain-text fallback ────────────────────────────────────────────────
  const textLines: string[] = [
    `${BRAND.name}`,
    `Quality Feedback – ${d.title}`,
    "",
    `Hello ${greetingName},`,
    "",
    `A quality evaluation has been completed for your recent ${interactionLabel} interaction.`,
    "",
    `Overall Quality Score: ${overallLabel}`,
    "",
  ];
  if (metrics.length) {
    textLines.push("Quality Evaluation");
    for (const m of metrics) textLines.push(`  [x] ${m.label} — ${formatPct(m.score)}`);
    textLines.push("");
  }
  const narrativeText = (label: string, val?: string | null) => {
    const v = (val ?? "").trim();
    if (!v) return;
    textLines.push(label, v, "");
  };
  narrativeText("Summary", d.summary);
  narrativeText("Strengths", d.strengths);
  narrativeText("Areas to Improve", d.improvements);
  narrativeText("Recommended Actions", d.recommendedActions);
  textLines.push(
    `Open in QualiPulse: ${d.appBaseUrl}/portal/${d.feedbackId}`,
    "",
    "Regards,",
    `${BRAND.name} Team`,
    BRAND.tagline,
  );
  if (d.confidentialityNotice) textLines.push("", d.confidentialityNotice);

  // Suppress unused-parameter warnings from legacy fields.
  void senderName;

  return { subject, html, text: textLines.join("\n") };
}
