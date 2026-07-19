// Pure HTML email template — client-safe (no server imports).
//
// Zenwork Performance Manager — Performance Feedback Review email.
// Follows the canonical Zenwork sample layout: branded header, greeting,
// Feedback Summary, Overall Performance metrics table, star rating,
// Performance Highlights, Areas for Improvement, Coaching Recommendations,
// Manager's Comments, Next Steps, Need Assistance, and closing signature.
// Inline CSS for Gmail / Outlook / Apple Mail / mobile compatibility.

export type FeedbackEmailAttachmentLink = {
  fileName: string;
  url: string;
};

export type FeedbackMetric = { label: string; score: number };

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
  managerTitle?: string | null;
  nextSteps?: string | null;
  // New (sample-aligned) fields
  reviewPeriodStart?: string | null;
  reviewPeriodEnd?: string | null;
  metrics?: FeedbackMetric[] | null;
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
  gradient: "linear-gradient(135deg,#312e81 0%,#4338ca 40%,#6d28d9 100%)",
  gradientFallback: "#312e81",
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

const firstName = (full: string) => full.split(/\s+/)[0] || full;

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

const ratingFromScore = (score?: number | null): { label: string; stars: number } => {
  if (score == null) return { label: "Not scored", stars: 0 };
  if (score >= 90) return { label: "Excellent", stars: 5 };
  if (score >= 80) return { label: "Exceeds Expectations", stars: 4 };
  if (score >= 70) return { label: "Meets Expectations", stars: 3 };
  if (score >= 60) return { label: "Developing", stars: 2 };
  return { label: "Needs Improvement", stars: 1 };
};

const scoreColor = (score: number) => {
  if (score >= 90) return "#047857";
  if (score >= 80) return "#1d4ed8";
  if (score >= 70) return "#a16207";
  return "#b91c1c";
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

const monthYear = (iso?: string | null) => {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
};

const formatReviewId = (id: string) => {
  const short = id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase();
  const year = new Date().getFullYear();
  const numeric = parseInt(short, 36);
  const seq = Number.isNaN(numeric) ? short : String(numeric % 1000000).padStart(6, "0");
  return `FB-${year}-${seq}`;
};

// ── Reusable blocks ────────────────────────────────────────────────────────

const summaryRow = (label: string, value: string) => `
  <tr>
    <td style="padding:11px 0;border-bottom:1px solid ${BRAND.line};font:500 12px/1.4 ${FONT};color:${BRAND.mute};width:42%;letter-spacing:.02em;">${escape(label)}</td>
    <td style="padding:11px 0;border-bottom:1px solid ${BRAND.line};font:600 13.5px/1.4 ${FONT};color:${BRAND.ink};text-align:right;">${escape(value)}</td>
  </tr>`;

const sectionCard = (title: string, inner: string, accent = BRAND.accent) => `
  <tr><td style="padding:0 24px 20px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.surface};border:1px solid ${BRAND.line};border-radius:14px;overflow:hidden;">
      <tr><td style="padding:16px 20px;background:linear-gradient(90deg,${accent}14,transparent);border-bottom:1px solid ${BRAND.line};">
        <div style="font:700 12px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${accent};">${escape(title)}</div>
      </td></tr>
      <tr><td style="padding:18px 20px;font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">${inner}</td></tr>
    </table>
  </td></tr>`;

const bulletList = (items: string[], dotColor: string, emptyText = "Nothing recorded.") =>
  items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${items
        .map(
          (i) => `<tr>
            <td valign="top" width="20" style="padding:6px 8px 6px 0;">
              <div style="width:8px;height:8px;border-radius:99px;background:${dotColor};margin-top:8px;"></div>
            </td>
            <td style="padding:6px 0;font:14px/1.65 ${FONT};color:${BRAND.ink};">${escape(i)}</td>
          </tr>`,
        )
        .join("")}</table>`
    : `<div style="font:14px/1.6 ${FONT};color:${BRAND.mute};font-style:italic;">${escape(emptyText)}</div>`;

const metricsTable = (rows: FeedbackMetric[]) => {
  if (!rows.length) return "";
  const body = rows
    .map((r, i) => {
      const pct = Math.max(0, Math.min(100, Math.round(r.score)));
      const color = scoreColor(pct);
      const bg = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `
        <tr>
          <td style="padding:12px 16px;background:${bg};border-bottom:1px solid ${BRAND.line};font:500 13.5px/1.4 ${FONT};color:${BRAND.ink};">${escape(r.label)}</td>
          <td style="padding:12px 16px;background:${bg};border-bottom:1px solid ${BRAND.line};font:700 13.5px/1.4 ${FONT};color:${color};text-align:right;width:80px;">${pct}%</td>
        </tr>`;
    })
    .join("");
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid ${BRAND.line};border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:11px 16px;background:#f1f5f9;border-bottom:1px solid ${BRAND.line};font:700 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${BRAND.mute};">Metric</td>
        <td style="padding:11px 16px;background:#f1f5f9;border-bottom:1px solid ${BRAND.line};font:700 11px/1 ${FONT};letter-spacing:.12em;text-transform:uppercase;color:${BRAND.mute};text-align:right;">Score</td>
      </tr>
      ${body}
    </table>`;
};

const starRating = (stars: number, label: string) => {
  const full = "★".repeat(Math.max(0, Math.min(5, stars)));
  const empty = "☆".repeat(Math.max(0, 5 - stars));
  return `
    <div style="margin-top:18px;padding:16px 18px;background:linear-gradient(90deg,#fef3c7,#fffbeb);border:1px solid #fde68a;border-radius:12px;text-align:center;">
      <div style="font:600 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:#92400e;">Overall Rating</div>
      <div style="margin-top:10px;font:700 22px/1 ${FONT};color:#b45309;letter-spacing:.14em;">
        <span style="color:#f59e0b;">${full}</span><span style="color:#fde68a;">${empty}</span>
      </div>
      <div style="margin-top:10px;font:700 15px/1.2 ${FONT};color:${BRAND.ink};">${escape(label)}</div>
    </div>`;
};

// ── Main renderer ──────────────────────────────────────────────────────────

export function renderFeedbackEmail(d: FeedbackEmailData): { subject: string; html: string; text: string } {
  const ackUrl = `${d.appBaseUrl}/api/public/track/click/${d.feedbackId}?to=${encodeURIComponent(`/feedback/${d.feedbackId}`)}`;
  const pixelUrl = `${d.appBaseUrl}/api/public/track/open/${d.feedbackId}`;

  const isReminder = !!d.isReminder;
  const department = d.department ?? "Customer Success";
  const reviewDateIso = d.reviewDate ?? new Date().toISOString().slice(0, 10);
  const reviewDate = formatDate(reviewDateIso);
  const reviewMonth = monthYear(reviewDateIso);
  const reviewId = formatReviewId(d.feedbackId);

  const subjectBase = `Performance Feedback Review – ${department}${reviewMonth ? ` | ${reviewMonth}` : ""}`;
  const subject = isReminder ? `Reminder: Please acknowledge — ${subjectBase}` : subjectBase;

  const customerName = d.customerName ?? d.agentName;
  const greetingName = firstName(customerName);

  const rating = ratingFromScore(d.score);
  const overallRatingLabel = d.overallRating ?? rating.label;

  const strengths = toItems(d.strengths);
  const improvements = toItems(d.improvements);
  const coachingItems = toItems(d.recommendedActions);

  // Metrics: use provided list, or synthesize a canonical set anchored to score.
  const baseScore = d.score != null ? Math.round(d.score) : null;
  const derivedMetrics: FeedbackMetric[] =
    d.metrics && d.metrics.length
      ? d.metrics
      : baseScore != null
        ? [
            { label: "Overall Quality Score", score: baseScore },
            { label: "Customer Satisfaction (CSAT)", score: Math.max(0, Math.min(100, baseScore + 3)) },
            { label: "Communication Skills", score: Math.max(0, Math.min(100, baseScore + 2)) },
            { label: "Product Knowledge", score: Math.max(0, Math.min(100, baseScore - 1)) },
            { label: "Case Resolution", score: Math.max(0, Math.min(100, baseScore + 1)) },
            { label: "Process Compliance", score: Math.max(0, Math.min(100, baseScore - 2)) },
            { label: "Documentation Quality", score: Math.max(0, Math.min(100, baseScore - 3)) },
          ]
        : [];

  const reviewPeriod =
    d.reviewPeriodStart && d.reviewPeriodEnd
      ? `${formatDate(d.reviewPeriodStart)} – ${formatDate(d.reviewPeriodEnd)}`
      : d.interactionDate
        ? formatDate(d.interactionDate)
        : "—";

  const logoImg = d.logoUrl
    ? `<img src="${escape(d.logoUrl)}" alt="${escape(d.senderName ?? BRAND.name)}" height="44" style="display:block;height:44px;width:auto;max-width:200px;border:0;outline:none;text-decoration:none;background:transparent;" />`
    : `<div style="font:800 20px/1 ${FONT};color:#ffffff;letter-spacing:.06em;">ZENWORK</div>`;
  const logoHeader = `<a href="${escape(BRAND.website)}" target="_blank" style="display:inline-block;text-decoration:none;background:transparent;">${logoImg}</a>`;

  const reminderBanner = isReminder
    ? `<tr><td style="padding:0 24px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-left:4px solid #ea580c;border-radius:12px;margin-bottom:16px;">
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

  const highlightsIntro =
    d.feedbackType === "corrective"
      ? "During this evaluation period, the following strengths were noted:"
      : "Congratulations on another strong review. During this evaluation period, you consistently demonstrated:";

  const improvementsIntro =
    "While your overall performance is on track, the following areas present opportunities for further growth:";

  const coachingIntro = "Based on this evaluation, the following coaching activities are recommended:";

  const managerComments =
    d.managerComments ??
    (d.feedbackType === "corrective"
      ? `${greetingName} has the foundational skills required for the role. With focused coaching on the areas noted above, we are confident performance will strengthen materially over the coming weeks.`
      : d.feedbackType === "positive"
        ? `${greetingName} continues to demonstrate excellent ownership, professionalism, and a customer-first mindset. Communication quality and case handling remain consistently strong.`
        : `${greetingName} continues to demonstrate strong ownership, professionalism, and a customer-first mindset. By focusing on the improvement areas noted, ${greetingName} is well positioned for continued success.`);

  const managerSignatoryName = d.managerName ?? d.reviewerName ?? `${BRAND.name} Team`;
  const managerSignatoryTitle = d.managerTitle ?? "Customer Success Manager";

  const nextSteps =
    d.nextSteps ??
    `Please review your feedback in the ${BRAND.name} portal and discuss any questions or development goals during your next one-on-one meeting with your manager. If coaching has been assigned, you will receive a separate invitation to schedule your coaching session.${
      d.dueDate ? ` Kindly acknowledge this review by <strong style="color:${BRAND.ink};">${escape(formatDate(d.dueDate))}</strong>.` : ""
    }`;

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
      .hero-title{font-size:22px !important;line-height:1.25 !important;}
      .cta{display:block !important;width:100% !important;box-sizing:border-box !important;text-align:center !important;}
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Performance Feedback Review for ${escape(greetingName)} — ${escape(reviewId)}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.page};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" class="container" width="640" cellpadding="0" cellspacing="0" style="width:640px;max-width:640px;background:${BRAND.surface};border-radius:18px;overflow:hidden;box-shadow:0 10px 40px rgba(15,23,42,.08);">

        <!-- Header -->
        <tr>
          <td class="fallback px" style="padding:28px 28px 30px;background:${BRAND.gradient};background-color:${BRAND.gradientFallback};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                <td valign="middle">${logoHeader}</td>
                <td valign="middle" align="right" style="font:600 11px/1 ${FONT};letter-spacing:.16em;text-transform:uppercase;color:rgba(255,255,255,.85);">
                  ${escape(reviewMonth || reviewDate)}
                </td>
              </tr>
            </table>
            <div style="margin-top:22px;font:700 12px/1 ${FONT};letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.85);">${escape(BRAND.name)}</div>
            <div class="hero-title" style="margin-top:10px;font:700 26px/1.25 ${FONT};color:#ffffff;letter-spacing:-.01em;">Performance Feedback Review</div>
            <div style="margin-top:8px;font:400 14px/1.55 ${FONT};color:rgba(255,255,255,.9);max-width:520px;">${escape(BRAND.tagline)}</div>
          </td>
        </tr>

        ${reminderBanner}

        <!-- Greeting -->
        <tr><td class="px" style="padding:28px 28px 4px;">
          <div style="font:600 16px/1.5 ${FONT};color:${BRAND.ink};">Hello ${escape(greetingName)},</div>
          <div style="margin-top:12px;font:15px/1.75 ${FONT};color:${BRAND.inkSoft};">We hope you're doing well.</div>
          <div style="margin-top:12px;font:15px/1.75 ${FONT};color:${BRAND.inkSoft};">
            Your recent performance evaluation has been completed in <strong style="color:${BRAND.ink};">${escape(BRAND.name)}</strong>. Thank you for your continued commitment to delivering an excellent customer experience. This review is intended to recognize your strengths, provide actionable feedback, and support your professional development.
          </div>
        </td></tr>

        <!-- Feedback Summary -->
        <tr><td class="px" style="padding:20px 24px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:linear-gradient(180deg,#f8fafc,#ffffff);border:1px solid ${BRAND.line};border-radius:16px;">
            <tr><td style="padding:20px 22px 6px;">
              <div style="font:700 11px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${BRAND.accent};">Feedback Summary</div>
              <div style="margin-top:6px;font:700 18px/1.35 ${FONT};color:${BRAND.ink};">${escape(d.title)}</div>
            </td></tr>
            <tr><td style="padding:10px 22px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${summaryRow("Review ID", reviewId)}
                ${summaryRow("Evaluation Date", reviewDate)}
                ${summaryRow("Evaluator", d.reviewerName ?? d.managerName ?? "—")}
                ${summaryRow("Department", department)}
                ${summaryRow("Review Period", reviewPeriod)}
              </table>
            </td></tr>
          </table>
        </td></tr>

        <!-- Overall Performance -->
        ${
          derivedMetrics.length
            ? `<tr><td class="px" style="padding:12px 24px 8px;">
                <div style="font:700 12px/1 ${FONT};letter-spacing:.14em;text-transform:uppercase;color:${BRAND.accent};margin-bottom:12px;">Overall Performance</div>
                ${metricsTable(derivedMetrics)}
                ${starRating(rating.stars, overallRatingLabel)}
              </td></tr>`
            : ""
        }

        <!-- Performance Highlights -->
        ${sectionCard(
          "Performance Highlights",
          `<div style="margin-bottom:12px;font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">${escape(highlightsIntro)}</div>${bulletList(
            strengths.length
              ? strengths
              : [
                  "Professional and empathetic communication with customers.",
                  "Strong understanding of products and internal processes.",
                  "Timely case ownership and follow-up.",
                  "High customer satisfaction scores.",
                  "Excellent collaboration with team members.",
                  "Consistent adherence to quality standards.",
                ],
            "#10b981",
          )}<div style="margin-top:14px;font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">Your dedication continues to make a positive impact on both customer experience and team performance.</div>`,
          "#10b981",
        )}

        <!-- Areas for Improvement -->
        ${sectionCard(
          "Areas for Improvement",
          `<div style="margin-bottom:12px;font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">${escape(improvementsIntro)}</div>${bulletList(
            improvements.length
              ? improvements
              : [
                  "Improve documentation detail for complex customer interactions.",
                  "Increase the use of standardized troubleshooting workflows.",
                  "Enhance proactive communication during longer case resolutions.",
                  "Continue strengthening knowledge of newly released features and policies.",
                ],
            "#f59e0b",
          )}`,
          "#f59e0b",
        )}

        <!-- Coaching Recommendations -->
        ${sectionCard(
          "Coaching Recommendations",
          `<div style="margin-bottom:12px;font:14px/1.7 ${FONT};color:${BRAND.inkSoft};">${escape(coachingIntro)}</div>${bulletList(
            coachingItems.length
              ? coachingItems
              : [
                  "Attend the upcoming Advanced Customer Communication Workshop.",
                  "Complete the latest Product Knowledge refresher training.",
                  "Review best-practice documentation for case management.",
                  "Schedule a one-on-one coaching session with your Team Manager within the next two weeks.",
                ],
            "#4f46e5",
          )}`,
          "#4f46e5",
        )}

        <!-- Manager's Comments -->
        ${sectionCard(
          "Manager's Comments",
          `<div style="font:15px/1.8 ${FONT};color:${BRAND.ink};font-style:italic;border-left:3px solid #7c3aed;padding-left:14px;">${escape(managerComments)}</div>
           <div style="margin-top:14px;font:600 14px/1.4 ${FONT};color:${BRAND.ink};">— ${escape(managerSignatoryName)}</div>
           <div style="margin-top:2px;font:500 12.5px/1.4 ${FONT};color:${BRAND.mute};">${escape(managerSignatoryTitle)}</div>`,
          "#7c3aed",
        )}

        ${attachmentsBlock}

        <!-- Next Steps -->
        ${sectionCard("Next Steps", `<div style="font:14px/1.75 ${FONT};color:${BRAND.inkSoft};">${nextSteps}</div>`, "#0ea5e9")}

        <!-- CTA -->
        <tr><td class="px" align="center" style="padding:4px 24px 24px;">
          <a href="${ackUrl}" class="cta" style="display:inline-block;padding:14px 28px;background:${BRAND.gradient};background-color:${BRAND.gradientFallback};color:#ffffff;text-decoration:none;border-radius:12px;font:700 15px/1 ${FONT};letter-spacing:.01em;box-shadow:0 6px 18px rgba(79,70,229,.28);">
            Open Review in Portal →
          </a>
          <div style="margin-top:12px;font:12px/1.5 ${FONT};color:${BRAND.mute};">
            Or open directly: <a href="${ackUrl}" style="color:${BRAND.accent};text-decoration:none;">${escape(`${d.appBaseUrl}/feedback/${d.feedbackId}`)}</a>
          </div>
        </td></tr>

        <!-- Need Assistance -->
        ${sectionCard(
          "Need Assistance?",
          `<div style="font:14px/1.75 ${FONT};color:${BRAND.inkSoft};">
            If you have any questions regarding this performance review or believe any information requires clarification, please contact your manager or reach out to the Customer Success Operations team.
          </div>
          <div style="margin-top:10px;font:14px/1.75 ${FONT};color:${BRAND.inkSoft};">
            📧 <a href="mailto:${escape(BRAND.supportEmail)}" style="color:${BRAND.accent};text-decoration:none;">${escape(BRAND.supportEmail)}</a>
            &nbsp;·&nbsp; 🌐 <a href="${escape(BRAND.supportUrl)}" target="_blank" style="color:${BRAND.accent};text-decoration:none;">Support Portal</a>
          </div>`,
          "#64748b",
        )}

        <!-- Closing -->
        <tr><td class="px" style="padding:4px 28px 8px;">
          <div style="font:15px/1.75 ${FONT};color:${BRAND.inkSoft};">
            Thank you for your continued dedication and commitment to delivering outstanding customer experiences. We appreciate your contributions and look forward to supporting your continued growth and success.
          </div>
          <div style="margin-top:18px;font:600 15px/1.5 ${FONT};color:${BRAND.ink};">Kind Regards,</div>
          <div style="margin-top:2px;font:700 15px/1.5 ${FONT};color:${BRAND.ink};">${escape(BRAND.name)} Team</div>
          <div style="margin-top:4px;font:500 12.5px/1.5 ${FONT};color:${BRAND.mute};font-style:italic;">${escape(BRAND.tagline)}.</div>
        </td></tr>

        <!-- Automated notice -->
        <tr><td class="px" style="padding:18px 28px 28px;">
          <div style="padding:12px 14px;background:#f8fafc;border:1px dashed ${BRAND.line};border-radius:10px;font:500 12px/1.6 ${FONT};color:${BRAND.mute};">
            This is an automated email generated by ${escape(BRAND.name)}. Please do not reply directly to this message.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:24px 28px;background:#0f172a;color:#94a3b8;font:12px/1.6 ${FONT};">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr>
              <td align="center" style="font:700 13px/1.3 ${FONT};color:#e2e8f0;">${escape(BRAND.name)}</td>
            </tr>
            <tr>
              <td align="center" style="padding-top:4px;font:500 11px/1.5 ${FONT};color:#94a3b8;font-style:italic;">${escape(BRAND.tagline)}</td>
            </tr>
            <tr>
              <td align="center" style="padding-top:14px;">
                <a href="${escape(BRAND.privacyUrl)}" style="color:#cbd5e1;text-decoration:none;font:600 12px/1 ${FONT};margin:0 8px;">Privacy Policy</a>
                <span style="color:#334155;">·</span>
                <a href="${escape(BRAND.termsUrl)}" style="color:#cbd5e1;text-decoration:none;font:600 12px/1 ${FONT};margin:0 8px;">Terms of Service</a>
                <span style="color:#334155;">·</span>
                <a href="${escape(BRAND.supportUrl)}" style="color:#cbd5e1;text-decoration:none;font:600 12px/1 ${FONT};margin:0 8px;">Support Center</a>
                <span style="color:#334155;">·</span>
                <a href="${escape(BRAND.contactUrl)}" style="color:#cbd5e1;text-decoration:none;font:600 12px/1 ${FONT};margin:0 8px;">Contact Us</a>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding-top:14px;border-top:1px solid #1e293b;">
                <div style="padding-top:12px;color:#94a3b8;">© ${new Date().getFullYear()} ${escape(BRAND.name)}. All rights reserved.</div>
                <div style="margin-top:4px;color:#64748b;">${escape(BRAND.address)}</div>
                <div style="margin-top:6px;color:#475569;font-size:11px;">Review ID · ${escape(reviewId)}</div>
              </td>
            </tr>
          </table>
          ${
            d.confidentialityNotice
              ? `<div style="margin-top:14px;padding-top:12px;border-top:1px solid #1e293b;font-style:italic;color:#64748b;text-align:center;">${escape(d.confidentialityNotice)}</div>`
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
  const metricLines = derivedMetrics.length
    ? [`OVERALL PERFORMANCE`, line, ...derivedMetrics.map((m) => `${m.label.padEnd(34)} ${Math.round(m.score)}%`), ""]
    : [];
  const text = [
    `${BRAND.name.toUpperCase()}`,
    BRAND.tagline,
    line,
    `Performance Feedback Review${reviewMonth ? ` – ${department} | ${reviewMonth}` : ""}`,
    "",
    `Hello ${greetingName},`,
    "",
    "We hope you're doing well.",
    "",
    `Your recent performance evaluation has been completed in ${BRAND.name}. Thank you for your continued commitment to delivering an excellent customer experience.`,
    "",
    "FEEDBACK SUMMARY",
    line,
    `Review ID:        ${reviewId}`,
    `Evaluation Date:  ${reviewDate}`,
    `Evaluator:        ${d.reviewerName ?? d.managerName ?? "—"}`,
    `Department:       ${department}`,
    `Review Period:    ${reviewPeriod}`,
    "",
    ...metricLines,
    `Overall Rating:   ${overallRatingLabel} (${rating.stars}/5 stars)`,
    "",
    "PERFORMANCE HIGHLIGHTS",
    line,
    highlightsIntro,
    ...(strengths.length ? strengths : [
      "Professional and empathetic communication with customers.",
      "Strong understanding of products and internal processes.",
      "Timely case ownership and follow-up.",
    ]).map((s) => `• ${s}`),
    "",
    "AREAS FOR IMPROVEMENT",
    line,
    improvementsIntro,
    ...(improvements.length ? improvements : [
      "Improve documentation detail for complex customer interactions.",
      "Increase the use of standardized troubleshooting workflows.",
    ]).map((s) => `• ${s}`),
    "",
    "COACHING RECOMMENDATIONS",
    line,
    coachingIntro,
    ...(coachingItems.length ? coachingItems : [
      "Attend the upcoming Advanced Customer Communication Workshop.",
      "Complete the latest Product Knowledge refresher training.",
      "Schedule a one-on-one coaching session with your Team Manager.",
    ]).map((s) => `• ${s}`),
    "",
    "MANAGER'S COMMENTS",
    line,
    managerComments,
    `— ${managerSignatoryName}, ${managerSignatoryTitle}`,
    "",
    "NEXT STEPS",
    line,
    nextSteps.replace(/<[^>]+>/g, ""),
    "",
    `Open in portal: ${ackUrl}`,
    d.dueDate ? `Acknowledge by: ${formatDate(d.dueDate)}` : "",
    "",
    "NEED ASSISTANCE?",
    line,
    "If you have questions or need clarification, please contact your manager or the Customer Success Operations team.",
    `${BRAND.supportEmail} · ${BRAND.supportUrl}`,
    "",
    "Kind Regards,",
    `${BRAND.name} Team`,
    `${BRAND.tagline}.`,
    "",
    `This is an automated email generated by ${BRAND.name}. Please do not reply directly to this message.`,
    d.confidentialityNotice ? `\n${d.confidentialityNotice}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  return { subject, html, text };
}
