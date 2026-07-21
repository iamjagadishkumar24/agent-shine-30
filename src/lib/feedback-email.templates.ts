// Pure HTML email template — client-safe (no server imports).
// QualiPulse feedback email: mobile-friendly, no marketing, full scorecard.

import {
  BRAND,
  QUALITY_PARAMETERS,
  QUALITY_PARAMETER_WEIGHTS,
  computeOverallScore,
  type QualityParameter,
} from "./brand";
import { labelFromPercentage } from "./scorecard";

export type FeedbackEmailAttachmentLink = { fileName: string; url: string };

export type FeedbackMetric = {
  label: string;
  score: number;                 // selected percentage 0..100
  maxPoints?: number | null;     // parameter weight (defaults to canonical)
  earnedPoints?: number | null;  // computed if omitted
  note?: string | null;          // evaluator comment
};

export type FeedbackEmailData = {
  feedbackId: string;
  caseNumber?: string | null;
  title: string;
  agentName: string;
  teamName?: string | null;
  evaluatorName?: string | null;
  category?: string;
  feedbackType?: string;
  severity?: string;
  interactionType?: string | null;
  interactionReference?: string | null;
  interactionDate?: string | null;
  score?: number | null;
  summary?: string | null;
  strengths?: string | null;
  improvements?: string | null;
  recommendedActions?: string | null;
  dueDate?: string | null;
  acknowledgementDueAt?: string | null;
  reviewerName?: string | null;
  managerName?: string | null;
  appBaseUrl: string;
  isReminder?: boolean;
  reminderCount?: number;
  senderName?: string;
  logoUrl?: string | null;
  signatureHtml?: string | null;
  confidentialityNotice?: string | null;
  attachmentLinks?: FeedbackEmailAttachmentLink[];
  metrics?: FeedbackMetric[] | null;
  replyToEmail?: string | null;
  // Legacy fields (ignored, kept for API compat)
  customerName?: string | null;
  department?: string | null;
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
const HEADER_TINT = "#eef2ff";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const firstName = (full: string) => full.split(/\s+/)[0] || full;

function formatPct(n: number): string {
  return `${(Math.round(n * 10) / 10).toFixed(1)}%`;
}

function formatPoints(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

function scoreColor(n: number): string {
  if (n >= 90) return "#047857";
  if (n >= 80) return "#1d4ed8";
  if (n >= 70) return "#a16207";
  return "#b91c1c";
}

// Fill missing per-parameter rows with 0% so the email always shows all seven.
function normalizeMetrics(input?: FeedbackMetric[] | null): Required<Omit<FeedbackMetric, "note">> & { note: string | null }[] extends never ? never : FeedbackMetric[] {
  const byKey = new Map<string, FeedbackMetric>();
  for (const m of input ?? []) {
    const k = (m.label ?? "").trim().toLowerCase();
    if (k) byKey.set(k, m);
  }
  const out: FeedbackMetric[] = [];
  for (const label of QUALITY_PARAMETERS) {
    const key = label.toLowerCase();
    const src = byKey.get(key);
    const weight = QUALITY_PARAMETER_WEIGHTS[label as QualityParameter];
    const score = src?.score != null && !Number.isNaN(Number(src.score)) ? Math.max(0, Math.min(100, Number(src.score))) : 0;
    const max = Number(src?.maxPoints ?? weight);
    const earned = src?.earnedPoints != null ? Number(src.earnedPoints) : (max * score) / 100;
    out.push({ label, score, maxPoints: max, earnedPoints: earned, note: src?.note ?? null });
  }
  return out;
}

function narrativeBlock(title: string, body: string | null | undefined): string {
  const text = (body ?? "").trim();
  if (!text) return "";
  return `
    <tr><td style="padding:10px 24px 4px;">
      <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:6px;">${escape(title)}</div>
      <div style="font:14.5px/1.65 ${FONT};color:${INK};white-space:pre-wrap;">${escape(text)}</div>
    </td></tr>`;
}

function metaRow(label: string, value: string | null | undefined): string {
  const v = (value ?? "").trim();
  if (!v) return "";
  return `<tr>
    <td style="padding:4px 12px 4px 0;font:12px/1.5 ${FONT};color:${MUTE};white-space:nowrap;vertical-align:top;width:1%;">${escape(label)}</td>
    <td style="padding:4px 0;font:600 13px/1.5 ${FONT};color:${INK};vertical-align:top;">${escape(v)}</td>
  </tr>`;
}

export function renderFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const metrics = normalizeMetrics(d.metrics);
  const totalMax = metrics.reduce((s, m) => s + (Number(m.maxPoints) || 0), 0);
  const totalEarned = metrics.reduce((s, m) => s + (Number(m.earnedPoints) || 0), 0);
  const scoresForOverall = metrics.map((m) => Number(m.score));
  const computedOverall = computeOverallScore(scoresForOverall);
  const overall = typeof d.score === "number" && !Number.isNaN(d.score) ? d.score : computedOverall;
  const overallLabel = formatPct(overall);
  const performanceLabel = labelFromPercentage(overall);

  const interactionRaw = (d.interactionType ?? "").toLowerCase();
  const interactionLabel = interactionRaw === "case" ? "Case" : interactionRaw === "chat" ? "Chat" : "Interaction";

  const caseNumber = (d.caseNumber ?? "").trim();
  const casePart = caseNumber ? `Case ${caseNumber}` : "";
  const isReminder = !!d.isReminder;

  const subject = isReminder
    ? `Reminder: Acknowledgement Required – ${caseNumber ? `Case ${caseNumber}` : d.title}`
    : `Quality Feedback – ${caseNumber ? `Case ${caseNumber} – ` : ""}${d.agentName} – Score ${overallLabel}`;

  const greetingName = firstName(d.agentName);
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;
  const replyTo = d.replyToEmail || "itsjack2025@gmail.com";

  const logoImg = d.logoUrl
    ? `<img src="${escape(d.logoUrl)}" alt="${escape(BRAND.name)}" height="36" style="display:block;height:36px;width:auto;max-width:180px;border:0;outline:none;text-decoration:none;" />`
    : "";

  const brandBlock = `
    <table role="presentation" cellpadding="0" cellspacing="0"><tr>
      ${logoImg ? `<td style="padding-right:12px;vertical-align:middle;">${logoImg}</td>` : ""}
      <td style="vertical-align:middle;">
        <div style="font:800 20px/1.15 ${FONT};color:${INK};letter-spacing:-0.01em;">${escape(BRAND.name)}</div>
        <div style="margin-top:2px;font:12px/1.3 ${FONT};color:${MUTE};">${escape(BRAND.tagline)}</div>
      </td>
    </tr></table>`;

  const metricsRows = metrics
    .map((m) => {
      const pct = formatPct(Number(m.score));
      const max = formatPoints(Number(m.maxPoints));
      const earned = formatPoints(Number(m.earnedPoints));
      const color = scoreColor(Number(m.score));
      const note = (m.note ?? "").trim();
      return `
        <tr>
          <td style="padding:10px 10px 10px 12px;font:14px/1.4 ${FONT};color:${INK};border-bottom:1px solid ${LINE};vertical-align:top;">${escape(m.label)}</td>
          <td align="right" style="padding:10px;font:600 13px/1.4 ${FONT};color:${INK_SOFT};border-bottom:1px solid ${LINE};vertical-align:top;white-space:nowrap;">${max}</td>
          <td align="right" style="padding:10px;font:700 13px/1.4 ${FONT};color:${color};border-bottom:1px solid ${LINE};vertical-align:top;white-space:nowrap;">${pct}</td>
          <td align="right" style="padding:10px;font:700 13px/1.4 ${FONT};color:${INK};border-bottom:1px solid ${LINE};vertical-align:top;white-space:nowrap;">${earned}</td>
          <td style="padding:10px 12px 10px 10px;font:13px/1.5 ${FONT};color:${INK_SOFT};border-bottom:1px solid ${LINE};vertical-align:top;">${note ? escape(note) : `<span style="color:${MUTE};">—</span>`}</td>
        </tr>`;
    })
    .join("");

  const scorecardBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:8px;">Quality Scorecard</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:${HEADER_TINT};">
            <th align="left"  style="padding:10px 12px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">QA Parameter</th>
            <th align="right" style="padding:10px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">Max</th>
            <th align="right" style="padding:10px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">Selected %</th>
            <th align="right" style="padding:10px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">Earned</th>
            <th align="left"  style="padding:10px 12px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">Evaluator Comment</th>
          </tr>
        </thead>
        <tbody>
          ${metricsRows}
          <tr style="background:#f8fafc;">
            <td style="padding:12px;font:800 13px/1.3 ${FONT};color:${INK};">Total</td>
            <td align="right" style="padding:12px;font:800 13px/1.3 ${FONT};color:${INK};">${formatPoints(totalMax)}</td>
            <td align="right" style="padding:12px;font:800 13px/1.3 ${FONT};color:${scoreColor(overall)};">${overallLabel}</td>
            <td align="right" style="padding:12px;font:800 13px/1.3 ${FONT};color:${INK};">${formatPoints(totalEarned)}</td>
            <td style="padding:12px;font:600 12px/1.3 ${FONT};color:${MUTE};">${escape(performanceLabel)}</td>
          </tr>
        </tbody>
      </table>
    </td></tr>`;

  const reminderBanner = isReminder
    ? `<tr><td style="padding:0 24px 10px;">
        <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-left:3px solid #ea580c;border-radius:8px;font:600 13px/1.4 ${FONT};color:#9a3412;">
          Reminder${d.reminderCount ? ` #${d.reminderCount}` : ""} — this feedback still needs your acknowledgement.
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

  const ackDue = (d.acknowledgementDueAt ?? "").trim();
  const ackBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <div style="font:800 13px/1.2 ${FONT};color:#78350f;letter-spacing:.06em;text-transform:uppercase;">Acknowledgement Required</div>
          <div style="margin-top:8px;font:14px/1.6 ${FONT};color:${INK};">
            Please review this quality feedback and acknowledge receipt by replying to this email.
            ${caseNumber ? `Include <strong>Case ${escape(caseNumber)}</strong> in your response and keep the original subject line intact so we can match your reply.` : "Keep the original subject line intact so we can match your reply."}
          </div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:10px;">
            ${metaRow("Status", "Pending Acknowledgement")}
            ${metaRow("Case number", caseNumber || null)}
            ${metaRow("Due by", ackDue ? new Date(ackDue).toUTCString() : null)}
            ${metaRow("Reply to", replyTo)}
          </table>
        </td></tr>
      </table>
    </td></tr>`;

  const heroBlock = `
    <tr><td style="padding:16px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,${HEADER_TINT},#ffffff);border:1px solid ${LINE};border-radius:12px;">
        <tr><td align="center" style="padding:18px 16px;">
          <div style="font:700 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};">Overall Quality Score</div>
          <div style="margin-top:8px;font:800 34px/1 ${FONT};color:${scoreColor(overall)};">${escape(overallLabel)}</div>
          <div style="margin-top:6px;font:600 12px/1.2 ${FONT};color:${MUTE};letter-spacing:.04em;text-transform:uppercase;">${escape(performanceLabel)}</div>
        </td></tr>
      </table>
    </td></tr>`;

  const infoBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${metaRow("Case number", caseNumber || null)}
        ${metaRow("Feedback title", d.title)}
        ${metaRow("Agent", d.agentName)}
        ${metaRow("Team", d.teamName)}
        ${metaRow("Evaluator", d.evaluatorName)}
        ${metaRow("Interaction type", interactionLabel)}
        ${metaRow("Interaction reference", d.interactionReference)}
        ${metaRow("Interaction date", d.interactionDate)}
        ${metaRow("Type", d.feedbackType)}
        ${metaRow("Severity", d.severity)}
      </table>
    </td></tr>`;

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light only" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escape(subject)}</title>
  <style>
    @media only screen and (max-width:620px){
      .container{width:100% !important;border-radius:0 !important;}
      .px{padding-left:16px !important;padding-right:16px !important;}
      table.scorecard th, table.scorecard td { font-size:12px !important; padding:8px 6px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Quality Feedback ${escape(casePart)} · ${escape(d.title)} · Overall ${escape(overallLabel)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,.06);">

        <tr><td class="px" style="padding:20px 24px;border-bottom:1px solid ${LINE};background:#ffffff;">
          ${brandBlock}
        </td></tr>

        ${reminderBanner}

        <tr><td class="px" style="padding:18px 24px 0;">
          <div style="font:800 18px/1.25 ${FONT};color:${INK};">Quality Feedback${caseNumber ? ` – Case ${escape(caseNumber)}` : ""}</div>
          <div style="margin-top:8px;font:14.5px/1.65 ${FONT};color:${INK_SOFT};">Hello ${escape(greetingName)}, a quality evaluation has been completed for your recent ${escape(interactionLabel)} interaction.</div>
        </td></tr>

        ${infoBlock}
        ${heroBlock}
        ${scorecardBlock}

        ${narrativeBlock("Summary", d.summary)}
        ${narrativeBlock("Strengths", d.strengths)}
        ${narrativeBlock("Areas to Improve", d.improvements)}
        ${narrativeBlock("Recommended Actions", d.recommendedActions)}
        ${attachmentsBlock}

        ${ackBlock}

        <tr><td class="px" style="padding:16px 24px 4px;">
          <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:6px;">How to reply</div>
          <div style="font:14px/1.6 ${FONT};color:${INK};">
            Reply directly to this email at <strong>${escape(replyTo)}</strong>. Keep the original subject line — including
            ${caseNumber ? `<strong>Case ${escape(caseNumber)}</strong>` : "the case number"} — so your response is automatically matched to this feedback record.
          </div>
        </td></tr>

        <tr><td class="px" style="padding:18px 24px 22px;border-top:1px solid ${LINE};margin-top:12px;">
          <div style="font:14.5px/1.6 ${FONT};color:${INK};">Regards,</div>
          <div style="margin-top:2px;font:700 14.5px/1.6 ${FONT};color:${INK};">${escape(BRAND.name)} Team</div>
          <div style="margin-top:2px;font:13px/1.6 ${FONT};color:${MUTE};">${escape(BRAND.tagline)}</div>
        </td></tr>

      </table>
      <div style="max-width:640px;margin:12px auto 0;padding:0 12px;font:11.5px/1.5 ${FONT};color:${MUTE};text-align:center;">
        ${d.confidentialityNotice ? `<div style="font-style:italic;">${escape(d.confidentialityNotice)}</div>` : ""}
      </div>
    </td></tr>
  </table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />
</body>
</html>`;

  // ── Plain-text fallback ────────────────────────────────────────────────
  const textLines: string[] = [
    `${BRAND.name} — ${BRAND.tagline}`,
    "",
    `Quality Feedback${caseNumber ? ` – Case ${caseNumber}` : ""}`,
    `Agent: ${d.agentName}${d.teamName ? ` (Team ${d.teamName})` : ""}`,
    d.evaluatorName ? `Evaluator: ${d.evaluatorName}` : "",
    `Interaction: ${interactionLabel}${d.interactionReference ? ` · Ref ${d.interactionReference}` : ""}${d.interactionDate ? ` · ${d.interactionDate}` : ""}`,
    `Type: ${d.feedbackType ?? "-"}   Severity: ${d.severity ?? "-"}`,
    "",
    `Overall Quality Score: ${overallLabel} (${performanceLabel})`,
    "",
    "Quality Scorecard:",
    "  Parameter                        Max   Selected   Earned   Comment",
  ];
  for (const m of metrics) {
    const label = String(m.label).padEnd(32).slice(0, 32);
    const max = formatPoints(Number(m.maxPoints)).padStart(4);
    const pct = formatPct(Number(m.score)).padStart(9);
    const earned = formatPoints(Number(m.earnedPoints)).padStart(7);
    const note = (m.note ?? "").trim();
    textLines.push(`  ${label} ${max}  ${pct}  ${earned}   ${note}`);
  }
  textLines.push(`  ${"Total".padEnd(32)} ${formatPoints(totalMax).padStart(4)}  ${overallLabel.padStart(9)}  ${formatPoints(totalEarned).padStart(7)}`);
  textLines.push("");
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
    "Acknowledgement Required",
    `Please review this quality feedback and acknowledge receipt by replying to this email${caseNumber ? ` — include Case ${caseNumber} in your response` : ""}.`,
    ackDue ? `Due by: ${new Date(ackDue).toUTCString()}` : "",
    `Reply to: ${replyTo}`,
    "",
    "Regards,",
    `${BRAND.name} Team`,
    BRAND.tagline,
  );
  if (d.confidentialityNotice) textLines.push("", d.confidentialityNotice);

  void d.senderName;
  return { subject, html, text: textLines.filter((l) => l !== undefined).join("\n") };
}
