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

// Canonical seven quality parameters, in canonical display order, with
// weights (max points) totalling 100.
export const QUALITY_PARAMETERS = [
  "Accuracy",
  "Understanding Customer Issues",
  "Customer Satisfaction",
  "Product Knowledge & Resolution",
  "Average Handling Time",
  "Compliance",
  "Technical Accuracy / IHD",
] as const;

export type QualityParameter = (typeof QUALITY_PARAMETERS)[number];

export const QUALITY_PARAMETER_WEIGHTS: Record<QualityParameter, number> = {
  "Accuracy": 20,
  "Understanding Customer Issues": 25,
  "Customer Satisfaction": 5,
  "Product Knowledge & Resolution": 20,
  "Average Handling Time": 10,
  "Compliance": 10,
  "Technical Accuracy / IHD": 10,
};

// Weighted overall score: each score is 0-100 for its parameter; the
// overall is the weighted average using QUALITY_PARAMETER_WEIGHTS (sum 100).
export function computeOverallScore(scores: readonly number[]): number {
  if (!scores.length) return 0;
  const weights = QUALITY_PARAMETERS.map((p) => QUALITY_PARAMETER_WEIGHTS[p]);
  const totalWeight = weights.reduce((a, b) => a + b, 0) || 1;
  let earned = 0;
  for (let i = 0; i < scores.length && i < weights.length; i++) {
    earned += (scores[i] * weights[i]) / 100;
  }
  return (earned / totalWeight) * 100;
}
