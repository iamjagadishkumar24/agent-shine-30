// Centralized brand configuration — single source of truth for the app's
// public identity. Import from here rather than hard-coding strings.

export const BRAND = {
  name: "QualiPulse",
  tagline: "Quality Feedback and Performance Management",
  senderName: "QualiPulse Feedback Team",
  supportEmail: "support@qualipulse.app",
  website: "https://www.qualipulse.app",
  websiteLabel: "www.qualipulse.app",
  address: "QualiPulse Inc.",
  markPath: "/favicon.png",
  signatureText: [
    "Regards,",
    "QualiPulse Team",
    "Quality Feedback and Performance Management",
  ].join("\n"),
  signatureHtml:
    '<p style="margin:0;font:15px/1.6 -apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">Regards,<br/><strong>QualiPulse Team</strong><br/><span style="color:#475569;">Quality Feedback and Performance Management</span></p>',
} as const;

// Canonical seven quality parameters, in canonical display order.
// Each parameter is scored 0-100%. Overall = average of the seven.
export const QUALITY_PARAMETERS = [
  "Greeting and Introduction",
  "Communication Clarity",
  "Product or Process Knowledge",
  "Issue Resolution",
  "Empathy and Professionalism",
  "Accuracy and Compliance",
  "Closing and Next Steps",
] as const;

export type QualityParameter = (typeof QUALITY_PARAMETERS)[number];

export function computeOverallScore(scores: readonly number[]): number {
  if (!scores.length) return 0;
  const sum = scores.reduce((a, b) => a + b, 0);
  return sum / scores.length;
}
