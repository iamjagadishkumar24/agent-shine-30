// Pure HTML email template — client-safe (no server imports).
// QualiPulse feedback email: short, mobile-friendly, professional.
// Contains ONLY: brand, title, case #, agent, interaction type, date, overall
// score, quality table (Parameter + Score), Summary, Strengths, Areas for
// Improvement, Acknowledgement notice, and a minimal brand footer.

import {
  BRAND,
  QUALITY_PARAMETERS,
  QUALITY_PARAMETER_WEIGHTS,
  computeOverallScore,
  type QualityParameter,
} from "./brand";
import { labelFromPercentage } from "./scorecard";
import {
  resolveFeedbackEmailStrings,
  type FeedbackEmailLocale,
} from "./feedback-email.i18n";

export type FeedbackEmailAttachmentLink = { fileName: string; url: string };

export type FeedbackMetric = {
  label: string;
  score: number;                 // selected percentage 0..100
  maxPoints?: number | null;     // parameter weight (defaults to canonical)
  earnedPoints?: number | null;  // computed if omitted
  note?: string | null;          // (ignored in new template)
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
  locale?: FeedbackEmailLocale | string | null;
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

function formatPoints(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(2);
}

function scoreColor(pct: number): string {
  if (pct >= 90) return "#047857";
  if (pct >= 80) return "#1d4ed8";
  if (pct >= 70) return "#a16207";
  return "#b91c1c";
}

function normalizeMetrics(input?: FeedbackMetric[] | null): FeedbackMetric[] {
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
    <tr><td style="padding:14px 24px 4px;">
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
  const t = resolveFeedbackEmailStrings(d.locale ?? "en");
  const metrics = normalizeMetrics(d.metrics);
  const totalMax = metrics.reduce((s, m) => s + (Number(m.maxPoints) || 0), 0);
  const totalEarned = metrics.reduce((s, m) => s + (Number(m.earnedPoints) || 0), 0);
  const scoresForOverall = metrics.map((m) => Number(m.score));
  const computedOverall = computeOverallScore(scoresForOverall);
  const overall = typeof d.score === "number" && !Number.isNaN(d.score) ? d.score : computedOverall;
  const earnedOutOf = `${formatPoints(totalEarned)} / ${formatPoints(totalMax)}`;
  const performanceLabel = labelFromPercentage(overall);

  const interactionRaw = (d.interactionType ?? "").toLowerCase();
  const isChat = interactionRaw === "chat";
  const interactionLabel =
    interactionRaw === "case" ? t.interactionCase : isChat ? t.interactionChat : t.interactionGeneric;

  const caseNumber = (d.caseNumber ?? "").trim();
  const externalRef = (d.interactionReference ?? "").trim();
  const identifier = caseNumber || externalRef;
  const identifierLabel = isChat ? "Chat No" : "Case No";
  const isReminder = !!d.isReminder;

  // Canonical, searchable subject required by product:
  //   Performance Feedback Review > Audit Feedback Form - Case No: XXXXX
  //   Performance Feedback Review > Audit Feedback Form - Chat No: XXXXX
  const subjectBase = `Performance Feedback Review > Audit Feedback Form${identifier ? ` - ${identifierLabel}: ${identifier}` : ""}`;
  const subject = isReminder ? `${t.subjectReminderPrefix} – ${subjectBase}` : subjectBase;

  const greetingName = firstName(d.agentName);
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;
  const replyTo = d.replyToEmail || "";

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
      const max = formatPoints(Number(m.maxPoints));
      const earned = formatPoints(Number(m.earnedPoints));
      const color = scoreColor(Number(m.score));
      const note = (m.note ?? "").trim();
      const noteRow = note
        ? `
        <tr>
          <td colspan="2" style="padding:2px 12px 12px;border-bottom:1px solid ${LINE};background:#fafbfc;">
            <div style="font:700 10px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${MUTE};margin-bottom:4px;">Comments</div>
            <div style="font:13px/1.55 ${FONT};color:${INK_SOFT};white-space:pre-wrap;">${escape(note)}</div>
          </td>
        </tr>`
        : "";
      return `
        <tr>
          <td style="padding:11px 12px 4px;font:600 14px/1.4 ${FONT};color:${INK};${note ? "" : `border-bottom:1px solid ${LINE};`}vertical-align:top;">${escape(m.label)}</td>
          <td align="right" style="padding:11px 14px 4px;font:700 14px/1.4 ${FONT};color:${color};${note ? "" : `border-bottom:1px solid ${LINE};`}vertical-align:top;white-space:nowrap;tabular-nums:1;">${earned} / ${max}</td>
        </tr>${noteRow}`;
    })
    .join("");

  const scorecardBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <div style="font:700 12px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${MUTE};margin-bottom:8px;">${escape(t.qualityEvaluation)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid ${LINE};border-radius:10px;overflow:hidden;">
        <thead>
          <tr style="background:${HEADER_TINT};">
            <th align="left"  style="padding:10px 12px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">${escape(t.evaluationCriteria)}</th>
            <th align="right" style="padding:10px 14px;font:700 11px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${INK_SOFT};border-bottom:1px solid ${LINE};">${escape(t.scoreColumn)}</th>
          </tr>
        </thead>
        <tbody>
          ${metricsRows}
          <tr style="background:#f8fafc;">
            <td style="padding:14px 12px;font:800 14px/1.3 ${FONT};color:${INK};">${escape(t.overallScoreRow)}</td>
            <td align="right" style="padding:14px;font:800 15px/1.3 ${FONT};color:${scoreColor(overall)};">${earnedOutOf}</td>
          </tr>
        </tbody>
      </table>
    </td></tr>`;

  const reminderBanner = isReminder
    ? `<tr><td style="padding:0 24px 10px;">
        <div style="padding:12px 14px;background:#fff7ed;border:1px solid #fed7aa;border-left:3px solid #ea580c;border-radius:8px;font:600 13px/1.4 ${FONT};color:#9a3412;">
          ${escape(t.reminderBanner(d.reminderCount))}
        </div>
      </td></tr>`
    : "";

  const ackDue = (d.acknowledgementDueAt ?? "").trim();
  // ackBody may contain a <strong> tag around the case-number reference — keep
  // it as raw HTML (the case number itself is escaped inside the dictionary
  // through the caller passing a validated case-number string).
  const ackBodyHtml = t.ackBody(caseNumber ? escape(caseNumber) : null);
  const ackBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fefce8;border:1px solid #fde68a;border-left:4px solid #f59e0b;border-radius:10px;">
        <tr><td style="padding:14px 16px;">
          <div style="font:800 13px/1.2 ${FONT};color:#78350f;letter-spacing:.06em;text-transform:uppercase;">${escape(t.ackRequired)}</div>
          <div style="margin-top:8px;font:14px/1.6 ${FONT};color:${INK};">
            ${ackBodyHtml}
          </div>
          ${ackDue ? `<div style="margin-top:6px;font:600 12px/1.4 ${FONT};color:#78350f;">${escape(t.ackDueBy(new Date(ackDue).toUTCString()))}</div>` : ""}
        </td></tr>
      </table>
    </td></tr>`;

  const overallLabel = `${earnedOutOf}`;

  const heroBlock = `
    <tr><td style="padding:16px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,${HEADER_TINT},#ffffff);border:1px solid ${LINE};border-radius:12px;">
        <tr><td align="center" style="padding:18px 16px;">
          <div style="font:700 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${ACCENT};">${escape(t.overallQualityScore)}</div>
          <div style="margin-top:8px;font:800 30px/1 ${FONT};color:${scoreColor(overall)};">${escape(overallLabel)}</div>
          <div style="margin-top:6px;font:600 12px/1.2 ${FONT};color:${MUTE};letter-spacing:.04em;text-transform:uppercase;">${escape(performanceLabel)}</div>
        </td></tr>
      </table>
    </td></tr>`;

  const infoBlock = `
    <tr><td style="padding:14px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
        ${metaRow(t.metaCaseNumber, caseNumber || null)}
        ${metaRow(t.metaTitle, d.title)}
        ${metaRow(t.metaAgent, d.agentName)}
        ${metaRow(t.metaInteractionType, interactionLabel)}
        ${metaRow(t.metaDate, d.interactionDate)}
      </table>
    </td></tr>`;

  const html = `<!doctype html>
<html lang="${escape(t.htmlLang)}">
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
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${PAGE};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escape(t.subjectQualityFeedback)} ${escape(caseNumber ? `${t.caseWord} ${caseNumber}` : "")} · ${escape(d.title)} · ${escape(earnedOutOf)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${PAGE};">
    <tr><td align="center" style="padding:24px 12px;">
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 20px rgba(15,23,42,.06);">

        <tr><td class="px" style="padding:20px 24px;border-bottom:1px solid ${LINE};background:#ffffff;">
          ${brandBlock}
        </td></tr>

        ${reminderBanner}

        <tr><td class="px" style="padding:18px 24px 0;">
          <div style="font:800 18px/1.25 ${FONT};color:${INK};">${escape(d.title)}${caseNumber ? ` <span style="font-weight:600;color:${MUTE};">· ${escape(t.caseWord)} ${escape(caseNumber)}</span>` : ""}</div>
          <div style="margin-top:8px;font:14.5px/1.65 ${FONT};color:${INK_SOFT};">${escape(t.greeting(greetingName, interactionLabel))}</div>
        </td></tr>

        ${infoBlock}
        ${heroBlock}
        ${scorecardBlock}

        ${narrativeBlock(t.sectionSummary, d.summary)}
        ${narrativeBlock(t.sectionStrengths, d.strengths)}
        ${narrativeBlock(t.sectionImprovements, d.improvements)}

        ${ackBlock}

        <tr><td class="px" style="padding:18px 24px 22px;border-top:1px solid ${LINE};margin-top:12px;">
          <div style="font:600 13px/1.5 ${FONT};color:${MUTE};text-align:center;">${escape(BRAND.name)}</div>
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
  const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
  const textLines: string[] = [
    `${BRAND.name}`,
    "",
    `${d.title}${caseNumber ? ` · ${t.caseWord} ${caseNumber}` : ""}`,
    `${t.metaAgent}: ${d.agentName}`,
    `${t.metaInteractionType}: ${interactionLabel}`,
    d.interactionDate ? `${t.metaDate}: ${d.interactionDate}` : "",
    "",
    `${t.overallQualityScore}: ${earnedOutOf} (${performanceLabel})`,
    "",
    `${t.qualityEvaluation}:`,
  ];
  for (const m of metrics) {
    const max = formatPoints(Number(m.maxPoints));
    const earned = formatPoints(Number(m.earnedPoints));
    textLines.push(`  ${String(m.label).padEnd(40)} ${earned} / ${max}`);
  }
  textLines.push(`  ${t.overallScoreRow.padEnd(40)} ${earnedOutOf}`);
  textLines.push("");
  const narrativeText = (label: string, val?: string | null) => {
    const v = (val ?? "").trim();
    if (!v) return;
    textLines.push(label, v, "");
  };
  narrativeText(t.sectionSummary, d.summary);
  narrativeText(t.sectionStrengths, d.strengths);
  narrativeText(t.sectionImprovements, d.improvements);

  textLines.push(
    t.ackRequired,
    stripTags(t.ackBody(caseNumber || null)),
    ackDue ? `${t.ackDueBy(new Date(ackDue).toUTCString())}` : "",
    "",
    BRAND.name,
  );
  if (d.confidentialityNotice) textLines.push("", d.confidentialityNotice);

  void d.senderName;
  void replyTo;
  void d.recommendedActions;
  return { subject, html, text: textLines.filter((l) => l !== undefined && l !== null).join("\n") };
}
