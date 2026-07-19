// Pure HTML email template — client-safe (no server imports).
//
// Premium enterprise design for the Zenwork Performance Manager platform.
// Renders as if sent by a Customer Success Manager: gradient header, branded
// review card, KPI tiles, highlights/opportunities lists, coaching focus
// pills, and a platform-signed signature. Inline CSS for Gmail / Outlook /
// Apple Mail / mobile compatibility; degrades gracefully without images.

export type FeedbackEmailAttachmentLink = {
  fileName: string;
  url: string;
};

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
  managerName?: string | null;
  appBaseUrl: string;
  isReminder?: boolean;
  reminderCount?: number;
  // Branding
  senderName?: string;
  logoUrl?: string | null;
  signatureHtml?: string | null;
  confidentialityNotice?: string | null;
  attachmentLinks?: FeedbackEmailAttachmentLink[];
  // Optional enterprise metadata
  customerName?: string | null;
  department?: string | null;
  interactionDate?: string | null;
  reviewDate?: string | null;
  overallRating?: string | null;
  priority?: string | null;
  reviewStatus?: string | null;
  managerComments?: string | null;
  nextSteps?: string | null;
};

const BRAND = {
  name: "Zenwork Performance Manager",
  tagline: "Driving Customer Success Through Quality, Performance & Continuous Improvement",
  supportEmail: "support@zenwork.com",
  website: "https://zenwork.com",
  websiteLabel: "zenwork.com",
  privacyUrl: "https://zenwork.com/privacy",
  termsUrl: "https://zenwork.com/terms",
  supportUrl: "https://zenwork.com/support",
  contactUrl: "https://zenwork.com/contact",
  address: "Zenwork Inc. · Hyderabad, India",
  gradient: "linear-gradient(135deg,#4f46e5 0%,#7c3aed 45%,#0ea5e9 100%)",
  gradientFallback: "#4f46e5",
  ink: "#0f172a",
  inkSoft: "#334155",
  mute: "#64748b",
  line: "#e2e8f0",
  surface: "#ffffff",
  page: "#f1f5f9",
  accent: "#4f46e5",
};

const FONT = `-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif`;

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const titleCase = (s: string) =>
  s.replace(/(^|[\s_-])(\w)/g, (_, sep, ch) => (sep === "_" || sep === "-" ? " " : sep) + ch.toUpperCase());

// Split newline / bullet / comma-separated text into list items.
const toItems = (raw?: string | null): string[] => {
  if (!raw) return [];
  const parts = raw
    .split(/\r?\n|•|·|(?:^|\s)-\s|(?:^|\s)\*\s|;/g)
    .map((s) => s.replace(/^[-*•·\s]+/, "").trim())
    .filter(Boolean);
  if (parts.length > 1) return parts;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
};

const severityTone = (sev: string) => {
  const s = sev.toLowerCase();
  if (s === "critical") return { bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" };
  if (s === "high") return { bg: "#fff7ed", fg: "#9a3412", border: "#fed7aa" };
  if (s === "medium") return { bg: "#fefce8", fg: "#854d0e", border: "#fde68a" };
  return { bg: "#ecfdf5", fg: "#065f46", border: "#a7f3d0" };
};

const scoreTone = (score?: number | null) => {
  if (score == null) return { bg: "#f1f5f9", fg: "#334155" };
  if (score >= 85) return { bg: "#ecfdf5", fg: "#047857" };
  if (score >= 70) return { bg: "#eff6ff", fg: "#1d4ed8" };
  if (score >= 50) return { bg: "#fefce8", fg: "#a16207" };
  return { bg: "#fef2f2", fg: "#b91c1c" };
};

const ratingFromScore = (score?: number | null): string => {
  if (score == null) return "Not scored";
  if (score >= 90) return "Outstanding";
  if (score >= 80) return "Exceeds Expectations";
  if (score >= 70) return "Meets Expectations";
  if (score >= 60) return "Developing";
  return "Needs Improvement";
};

// ── Reusable blocks ────────────────────────────────────────────────────────

const kpi = (label: string, value: string, tone?: { bg: string; fg: string }) => `
  <td valign="top" style="padding:6px;">
    <div style="background:${tone?.bg ?? "#f8fafc"};border:1px solid ${BRAND.line};border-radius:12px;padding:14px 16px;">
      <div style="font:600 10px/1 ${FONT};letter-spacing:.1em;text-transform:uppercase;color:${BRAND.mute};">${escape(label)}</div>
      <div style="margin-top:8px;font:700 18px/1.2 ${FONT};color:${tone?.fg ?? BRAND.ink};">${escape(value)}</div>
    </div>
  </td>`;

const detailRow = (label: string, value: string) => `
  <tr>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font:500 12px/1.4 ${FONT};color:${BRAND.mute};width:42%;">${escape(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid ${BRAND.line};font:600 13px/1.4 ${FONT};color:${BRAND.ink};text-align:right;">${escape(value)}</td>
  </tr>`;

const sectionCard = (title: string, inner: string, accent = BRAND.accent) => `
  <tr><td style="padding:0 24px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:linear-gradient(90deg,${accent}14,transparent);border-bottom:1px solid ${BRAND.line};">
        <div style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${accent};">${escape(title)}</div>
      </td></tr>
      <tr><td style="padding:18px 20px;font:14px/1.65 ${FONT};color:${BRAND.inkSoft};">${inner}</td></tr>
    </table>
  </td></tr>`;

const bulletList = (items: string[], dotColor: string) =>
  items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
        .map(
          (i) => `<tr>
            <td valign="top" width="20" style="padding:6px 8px 6px 0;">
              <div style="width:8px;height:8px;border-radius:99px;background:${dotColor};margin-top:7px;"></div>
            </td>
            <td style="padding:6px 0;font:14px/1.6 ${FONT};color:${BRAND.ink};">${escape(i)}</td>
          </tr>`,
        )
        .join("")}</table>`
    : `<div style="font:14px/1.6 ${FONT};color:${BRAND.mute};font-style:italic;">Nothing recorded.</div>`;

const pillRow = (items: string[], color: string) =>
  items.length
    ? items
        .map(
          (i) =>
            `<span style="display:inline-block;margin:0 6px 8px 0;padding:6px 12px;border-radius:99px;background:${color}14;border:1px solid ${color}33;color:${color};font:600 12px/1 ${FONT};">${escape(i)}</span>`,
        )
        .join("")
    : `<span style="font:14px/1.6 ${FONT};color:${BRAND.mute};font-style:italic;">No focus areas assigned.</span>`;

const progressBar = (score?: number | null) => {
  if (score == null) return "";
  const pct = Math.max(0, Math.min(100, Number(score)));
  const tone = scoreTone(score);
  return `
    <div style="margin-top:10px;">
      <div style="display:flex;justify-content:space-between;font:500 11px/1 ${FONT};color:${BRAND.mute};margin-bottom:6px;">
        <span style="letter-spacing:.08em;text-transform:uppercase;">Quality Score</span>
        <span style="color:${tone.fg};font-weight:700;">${pct.toFixed(1)} / 100</span>
      </div>
      <div style="height:8px;background:#e2e8f0;border-radius:99px;overflow:hidden;">
        <div style="height:8px;width:${pct}%;background:${BRAND.gradient};background-color:${tone.fg};border-radius:99px;"></div>
      </div>
    </div>`;
};

// ── Main renderer ──────────────────────────────────────────────────────────

export function renderFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const ackUrl = `${d.appBaseUrl}/api/public/track/click/${d.feedbackId}?to=${encodeURIComponent(`/feedback/${d.feedbackId}`)}`;
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;

  const isReminder = !!d.isReminder;
  const feedbackTypeLabel = titleCase(d.feedbackType || "review");
  const subjectBase =
    d.feedbackType === "positive"
      ? "Recognition & Performance Review"
      : d.feedbackType === "corrective"
        ? "Performance Improvement Plan"
        : "Customer Success Quality Review";
  const subject = isReminder
    ? `Reminder: Please acknowledge — ${subjectBase} · ${d.title}`
    : `${subjectBase} — ${d.title}`;

  const reviewDate = d.reviewDate ?? new Date().toISOString().slice(0, 10);
  const overallRating = d.overallRating ?? ratingFromScore(d.score);
  const reviewStatus = d.reviewStatus ?? (isReminder ? "Awaiting acknowledgement" : "Ready for review");
  const priority = d.priority ?? titleCase(d.severity || "medium");
  const department = d.department ?? "Customer Success";
  const customerName = d.customerName ?? d.agentName;

  const strengths = toItems(d.strengths);
  const improvements = toItems(d.improvements);
  const coachingItems = toItems(d.recommendedActions);
  const sevTone = severityTone(d.severity);
  const sTone = scoreTone(d.score ?? null);

  const logoBlock = d.logoUrl
    ? `<img src="${escape(d.logoUrl)}" alt="${escape(d.senderName ?? BRAND.name)}" height="40" style="display:block;height:40px;width:auto;border:0;outline:none;text-decoration:none;" />`
    : `<div style="display:inline-block;padding:8px 14px;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:10px;font:700 14px/1 ${FONT};color:#ffffff;letter-spacing:.02em;">Zenwork</div>`;

  const reminderBanner = isReminder
    ? `<tr><td style="padding:0 24px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:12px;margin-bottom:20px;">
          <tr><td style="padding:14px 18px;">
            <div style="font:700 13px/1.3 ${FONT};color:#9a3412;">⚠︎ Reminder #${d.reminderCount ?? 1} — Acknowledgement required</div>
            <div style="margin-top:4px;font:13px/1.55 ${FONT};color:#9a3412;">This review is past its acknowledgement SLA. Please read and acknowledge below at your earliest convenience.</div>
          </td></tr>
        </table>
      </td></tr>`
    : "";

  const attachmentsBlock = (d.attachmentLinks ?? []).length
    ? sectionCard(
        "Attachments",
        (d.attachmentLinks ?? [])
          .map(
            (a) =>
              `<a href="${escape(a.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border:1px solid ${BRAND.line};border-radius:10px;background:#f8fafc;color:${BRAND.ink};text-decoration:none;font:600 13px/1 ${FONT};">📎 ${escape(a.fileName)}</a>`,
          )
          .join(""),
        "#0ea5e9",
      )
    : "";

  const managerComments =
    d.managerComments ??
    (d.feedbackType === "corrective"
      ? "After carefully reviewing this interaction, we've identified specific areas that require focused improvement. We're confident that with structured coaching and continued effort, service quality will strengthen materially. We're here to support this journey every step of the way."
      : d.feedbackType === "positive"
        ? "After carefully reviewing this interaction, we're delighted with the outstanding quality demonstrated. The experience reflected professionalism, empathy, and a clear customer-first mindset. Thank you for setting the standard for service excellence."
        : "After carefully reviewing this interaction, we're pleased with the overall quality demonstrated during this customer engagement. The support experience reflected professionalism, ownership, and a customer-first mindset. We encourage continued learning and coaching to further strengthen customer satisfaction and operational excellence. Keep up the great work.");

  const nextSteps =
    d.nextSteps ??
    `Your feedback has been recorded in ${BRAND.name}. Our Customer Success team will continue monitoring future interactions to help maintain exceptional service quality.${
      d.dueDate ? ` Please acknowledge this review by <strong style="color:${BRAND.ink};">${escape(d.dueDate)}</strong>.` : ""
    } If additional coaching is needed, you'll receive a follow-up notification with the scheduled session details.`;

  const signatureBlock = d.signatureHtml
    ? `<div style="margin-top:16px;font:13px/1.65 ${FONT};color:${BRAND.inkSoft};">${d.signatureHtml}</div>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <meta name="x-apple-disable-message-reformatting" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
  <title>${escape(subject)}</title>
  <!--[if mso]><style>table{border-collapse:collapse;} .fallback{background-color:${BRAND.gradientFallback} !important;}</style><![endif]-->
  <style>
    @media only screen and (max-width:620px){
      .container{width:100% !important;border-radius:0 !important;}
      .px{padding-left:16px !important;padding-right:16px !important;}
      .kpi-cell{display:block !important;width:100% !important;padding:4px 0 !important;}
      .hero-title{font-size:22px !important;line-height:1.25 !important;}
      .cta{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    ${escape(subjectBase)} for ${escape(customerName)} — Feedback ID ${escape(d.feedbackId.slice(0, 8))}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:${BRAND.surface};border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,.08);">

        <!-- Header -->
        <tr>
          <td class="fallback px" style="padding:28px 28px 30px;background:${BRAND.gradient};background-color:${BRAND.gradientFallback};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">${logoBlock}</td>
                <td valign="middle" align="right" style="font:600 11px/1 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.85);">
                  ${escape(feedbackTypeLabel)} · ${escape(reviewDate)}
                </td>
              </tr>
            </table>
            <div style="margin-top:22px;font:600 11px/1 ${FONT};letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.78);">${escape(BRAND.name)}</div>
            <div class="hero-title" style="margin-top:10px;font:700 26px/1.25 ${FONT};color:#ffffff;letter-spacing:-.01em;">${escape(subjectBase)}</div>
            <div style="margin-top:8px;font:400 14px/1.55 ${FONT};color:rgba(255,255,255,.86);max-width:520px;">${escape(BRAND.tagline)}</div>
          </td>
        </tr>

        <!-- Greeting -->
        <tr><td class="px" style="padding:28px 28px 8px;">
          <div style="font:600 15px/1.5 ${FONT};color:${BRAND.ink};">Hello ${escape(customerName)},</div>
          <div style="margin-top:10px;font:15px/1.7 ${FONT};color:${BRAND.inkSoft};">
            We hope you're doing well. Thank you for your continued partnership with our Customer Success team.
            At <strong style="color:${BRAND.ink};">${escape(BRAND.name)}</strong>, we're committed to delivering exceptional experiences through continuous quality improvement, structured coaching, and performance excellence.
          </div>
          <div style="margin-top:12px;font:15px/1.7 ${FONT};color:${BRAND.inkSoft};">
            Below is a summary of your recent review — <strong style="color:${BRAND.ink};">${escape(d.title)}</strong>.
          </div>
        </td></tr>

        ${reminderBanner}

        <!-- Review Summary Card -->
        <tr><td class="px" style="padding:20px 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#f8fafc,#ffffff);border:1px solid ${BRAND.line};border-radius:16px;">
            <tr><td style="padding:20px 22px 8px;">
              <div style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${BRAND.accent};">Review Summary</div>
              <div style="margin-top:6px;font:700 18px/1.35 ${FONT};color:${BRAND.ink};">${escape(d.title)}</div>
            </td></tr>
            <tr><td style="padding:6px 22px 0;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td class="kpi-cell" width="33%">${kpi("Quality Score", d.score != null ? `${Number(d.score).toFixed(1)}` : "—", sTone)}</td>
                  <td class="kpi-cell" width="33%">${kpi("Overall Rating", overallRating)}</td>
                  <td class="kpi-cell" width="33%">${kpi("Priority", priority, { bg: sevTone.bg, fg: sevTone.fg })}</td>
                </tr>
              </table>
              ${progressBar(d.score)}
            </td></tr>
            <tr><td style="padding:16px 22px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${detailRow("Feedback ID", d.feedbackId.slice(0, 8).toUpperCase())}
                ${detailRow("Customer", customerName)}
                ${detailRow("Support Agent", d.agentName)}
                ${detailRow("Department", department)}
                ${detailRow("Category", titleCase(d.category))}
                ${detailRow("Review Type", feedbackTypeLabel)}
                ${d.interactionDate ? detailRow("Interaction Date", d.interactionDate) : ""}
                ${detailRow("Review Date", reviewDate)}
                ${detailRow("Review Status", titleCase(reviewStatus))}
                ${d.managerName ? detailRow("Reporting Manager", d.managerName) : ""}
                ${d.reviewerName ? detailRow("Reviewed By", d.reviewerName) : ""}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Performance Overview -->
        ${d.summary ? sectionCard("Performance Overview", `<div style="white-space:pre-wrap;">${escape(d.summary)}</div>`) : ""}

        <!-- Highlights -->
        ${sectionCard("Highlights", bulletList(strengths, "#10b981"), "#10b981")}

        <!-- Opportunities -->
        ${sectionCard("Opportunities for Improvement", bulletList(improvements, "#f59e0b"), "#f59e0b")}

        <!-- Manager's Review -->
        ${sectionCard(
          "Manager's Review",
          `<div style="font:15px/1.75 ${FONT};color:${BRAND.ink};font-style:italic;border-left:3px solid ${BRAND.accent};padding-left:14px;">${escape(managerComments)}</div>`,
          "#7c3aed",
        )}

        <!-- Coaching Recommendations -->
        ${sectionCard(
          "Coaching Recommendations",
          `<div style="font:600 12px/1.4 ${FONT};color:${BRAND.mute};letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">Recommended Focus Areas</div>${pillRow(
            coachingItems.length ? coachingItems : ["Active Listening", "Product Knowledge", "Customer Empathy", "Communication", "Ownership"],
            "#4f46e5",
          )}`,
          "#4f46e5",
        )}

        ${attachmentsBlock}

        <!-- Next Steps -->
        ${sectionCard("Next Steps", `<div style="font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">${nextSteps}</div>`, "#0ea5e9")}

        <!-- CTA -->
        <tr><td class="px" align="center" style="padding:8px 24px 28px;">
          <a href="${ackUrl}" class="cta" style="display:inline-block;padding:14px 28px;background:${BRAND.gradient};background-color:${BRAND.gradientFallback};color:#ffffff;text-decoration:none;border-radius:12px;font:700 15px/1 ${FONT};letter-spacing:.01em;box-shadow:0 6px 18px rgba(79,70,229,.28);">
            Acknowledge Review →
          </a>
          <div style="margin-top:14px;font:12px/1.5 ${FONT};color:${BRAND.mute};">
            Or open directly: <a href="${ackUrl}" style="color:${BRAND.accent};text-decoration:none;">${escape(`${d.appBaseUrl}/feedback/${d.feedbackId}`)}</a>
          </div>
        </td></tr>

        <!-- Closing -->
        <tr><td class="px" style="padding:0 28px 8px;">
          <div style="font:15px/1.7 ${FONT};color:${BRAND.inkSoft};">
            Thank you for your continued dedication to delivering outstanding customer experiences. We appreciate your commitment to quality, continuous improvement, and operational excellence.
          </div>
          <div style="margin-top:12px;font:15px/1.7 ${FONT};color:${BRAND.inkSoft};">
            Together, we're building better customer experiences — every single day.
          </div>
          <div style="margin-top:18px;font:600 15px/1.5 ${FONT};color:${BRAND.ink};">Warm regards,</div>
        </td></tr>

        <!-- Signature -->
        <tr><td class="px" style="padding:16px 28px 28px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid ${BRAND.line};padding-top:20px;">
            <tr>
              <td valign="top" width="56" style="padding-right:14px;">
                <div style="width:48px;height:48px;border-radius:12px;background:${BRAND.gradient};background-color:${BRAND.gradientFallback};text-align:center;line-height:48px;font:700 18px/48px ${FONT};color:#ffffff;">Z</div>
              </td>
              <td valign="top">
                <div style="font:700 15px/1.3 ${FONT};color:${BRAND.ink};">Customer Success Team</div>
                <div style="margin-top:2px;font:600 13px/1.4 ${FONT};color:${BRAND.accent};">${escape(BRAND.name)}</div>
                <div style="margin-top:4px;font:12px/1.55 ${FONT};color:${BRAND.mute};font-style:italic;">${escape(BRAND.tagline)}</div>
                <div style="margin-top:10px;font:13px/1.6 ${FONT};color:${BRAND.inkSoft};">
                  📧 <a href="mailto:${escape(BRAND.supportEmail)}" style="color:${BRAND.accent};text-decoration:none;">${escape(BRAND.supportEmail)}</a>
                  &nbsp;·&nbsp; 🌐 <a href="${escape(BRAND.website)}" style="color:${BRAND.accent};text-decoration:none;">${escape(BRAND.website.replace(/^https?:\/\//, ""))}</a>
                </div>
                ${signatureBlock}
                <div style="margin-top:14px;padding:10px 12px;background:#f8fafc;border:1px dashed ${BRAND.line};border-radius:8px;font:500 12px/1.5 ${FONT};color:${BRAND.mute};">
                  This email was generated by the <strong style="color:${BRAND.ink};">${escape(BRAND.name)}</strong> Team.
                </div>
              </td>
            </tr>
          </table>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:18px 28px;background:#0f172a;color:#94a3b8;font:12px/1.55 ${FONT};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td>
                <div style="font:700 12px/1 ${FONT};color:#e2e8f0;letter-spacing:.14em;text-transform:uppercase;">${escape(BRAND.name)}</div>
                <div style="margin-top:6px;">© ${new Date().getFullYear()} Zenwork. All rights reserved.</div>
              </td>
              <td align="right" style="color:#64748b;">Feedback ID · ${escape(d.feedbackId.slice(0, 8).toUpperCase())}</td>
            </tr>
          </table>
          ${
            d.confidentialityNotice
              ? `<div style="margin-top:10px;padding-top:10px;border-top:1px solid #1e293b;font-style:italic;color:#64748b;">${escape(d.confidentialityNotice)}</div>`
              : ""
          }
        </td></tr>

      </table>
    </td></tr>
  </table>
  <img src="${pixelUrl}" width="1" height="1" alt="" style="display:none;width:1px;height:1px;border:0;" />
</body>
</html>`;

  // ── Plain-text fallback ─────────────────────────────────────────────────
  const line = "─".repeat(56);
  const text = [
    `${BRAND.name.toUpperCase()}`,
    BRAND.tagline,
    line,
    subjectBase,
    d.title,
    "",
    `Hello ${customerName},`,
    "",
    `Thank you for your continued partnership with our Customer Success team. Below is a summary of your recent review.`,
    "",
    "REVIEW SUMMARY",
    line,
    `Feedback ID:      ${d.feedbackId.slice(0, 8).toUpperCase()}`,
    `Customer:         ${customerName}`,
    `Support Agent:    ${d.agentName}`,
    `Department:       ${department}`,
    `Category:         ${titleCase(d.category)}`,
    `Review Type:      ${feedbackTypeLabel}`,
    d.interactionDate ? `Interaction Date: ${d.interactionDate}` : "",
    `Review Date:      ${reviewDate}`,
    `Quality Score:    ${d.score != null ? Number(d.score).toFixed(1) : "—"} / 100`,
    `Overall Rating:   ${overallRating}`,
    `Priority:         ${priority}`,
    `Review Status:    ${titleCase(reviewStatus)}`,
    d.managerName ? `Manager:          ${d.managerName}` : "",
    d.reviewerName ? `Reviewed By:      ${d.reviewerName}` : "",
    "",
    d.summary ? `PERFORMANCE OVERVIEW\n${line}\n${d.summary}\n` : "",
    strengths.length ? `HIGHLIGHTS\n${line}\n${strengths.map((s) => `• ${s}`).join("\n")}\n` : "",
    improvements.length ? `OPPORTUNITIES FOR IMPROVEMENT\n${line}\n${improvements.map((s) => `• ${s}`).join("\n")}\n` : "",
    `MANAGER'S REVIEW\n${line}\n${managerComments}\n`,
    coachingItems.length ? `COACHING RECOMMENDATIONS\n${line}\n${coachingItems.map((s) => `• ${s}`).join("\n")}\n` : "",
    (d.attachmentLinks ?? []).length
      ? `ATTACHMENTS\n${line}\n${(d.attachmentLinks ?? []).map((a) => `- ${a.fileName}: ${a.url}`).join("\n")}\n`
      : "",
    `NEXT STEPS\n${line}\n${nextSteps.replace(/<[^>]+>/g, "")}\n`,
    d.dueDate ? `Please acknowledge by ${d.dueDate}.\n` : "",
    `Acknowledge: ${ackUrl}`,
    "",
    "Warm regards,",
    `Customer Success Team · ${BRAND.name}`,
    `${BRAND.supportEmail} · ${BRAND.website}`,
    "",
    `This email was generated by the ${BRAND.name} Team.`,
    d.confidentialityNotice ? `\n${d.confidentialityNotice}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
