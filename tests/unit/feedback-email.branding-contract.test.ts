// End-to-end rendering contract for every feedback email template variant.
// Every rendered email MUST include: QualiPulse logo (when logoUrl is set),
// brand name + tagline in the header, a QA-YYYY-NNNNNN case number, an
// acknowledgement notice, and the branded footer.
import { describe, it, expect } from "vitest";
import { renderFeedbackEmail, type FeedbackMetric, type FeedbackEmailData } from "@/lib/feedback-email.templates";
import { BRAND, QUALITY_PARAMETERS } from "@/lib/brand";

const CASE_NUMBER_RE = /QA-\d{4}-\d{6}/;
const LOGO_URL = "https://cdn.qualipulse.test/logo.png";

type Variant = {
  name: string;
  overrides: Partial<FeedbackEmailData>;
};

const variants: Variant[] = [
  { name: "initial · chat · with logo",           overrides: { interactionType: "chat", caseNumber: "QA-2025-000001", logoUrl: LOGO_URL, isReminder: false } },
  { name: "initial · case · with logo",           overrides: { interactionType: "case", caseNumber: "QA-2025-000042", logoUrl: LOGO_URL, isReminder: false } },
  { name: "initial · chat · without logo",        overrides: { interactionType: "chat", caseNumber: "QA-2025-000123", logoUrl: null,    isReminder: false } },
  { name: "reminder · chat · with logo",          overrides: { interactionType: "chat", caseNumber: "QA-2026-000777", logoUrl: LOGO_URL, isReminder: true, reminderCount: 1 } },
  { name: "reminder · case · without logo",       overrides: { interactionType: "case", caseNumber: "QA-2026-009999", logoUrl: null,    isReminder: true, reminderCount: 3 } },
  { name: "initial · case · with ack due date",   overrides: { interactionType: "case", caseNumber: "QA-2027-000500", logoUrl: LOGO_URL, isReminder: false, acknowledgementDueAt: "2027-01-15T10:00:00Z" } },
];

function buildData(v: Variant): FeedbackEmailData {
  const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label, i) => ({
    label,
    score: 70 + i,
    maxPoints: [20, 25, 5, 20, 10, 10, 10][i],
    earnedPoints: [18, 22, 4, 17, 8, 9, 8][i],
  }));
  return {
    feedbackId: "fb-contract-test",
    title: "Quality Feedback",
    agentName: "Aisha Kumar",
    category: "customer_service",
    feedbackType: "quality",
    severity: "info",
    interactionType: "chat",
    interactionDate: "2027-01-10",
    score: null,
    summary: "Solid interaction overall.",
    strengths: "Great tone.",
    improvements: "Tighten closing.",
    recommendedActions: null,
    appBaseUrl: "https://app.qualipulse.test",
    metrics,
    logoUrl: null,
    senderName: "QualiPulse Feedback Team",
    ...v.overrides,
  };
}

describe("feedback email branding contract (all templates)", () => {
  for (const v of variants) {
    describe(v.name, () => {
      const { subject, html, text } = renderFeedbackEmail(buildData(v));
      const data = buildData(v);

      it("includes the QualiPulse brand name in the header", () => {
        expect(html).toContain(BRAND.name);
        expect(BRAND.name).toBe("QualiPulse");
      });

      it("includes the brand tagline in the header", () => {
        expect(html).toContain(BRAND.tagline);
      });

      it("renders the logo <img> when logoUrl is provided", () => {
        if (data.logoUrl) {
          expect(html).toContain(`src="${data.logoUrl}"`);
          expect(html).toMatch(/<img[^>]+alt="QualiPulse"/);
        } else {
          expect(html).not.toContain("<img src=\"https://cdn.qualipulse.test");
        }
      });

      it("includes a QA-YYYY-NNNNNN case number", () => {
        expect(data.caseNumber).toMatch(CASE_NUMBER_RE);
        expect(html).toMatch(CASE_NUMBER_RE);
        expect(html).toContain(`Case ${data.caseNumber}`);
        expect(subject).toContain(data.caseNumber!);
        expect(text).toMatch(CASE_NUMBER_RE);
      });

      it("includes the acknowledgement notice block", () => {
        expect(html).toContain("Acknowledgement Required");
        expect(html).toMatch(/acknowledge receipt by replying to this email/i);
        expect(text).toContain("Acknowledgement Required");
      });

      it("includes the branded footer", () => {
        // Footer row renders BRAND.name inside the bottom-border footer cell.
        const footerMatch = html.match(/border-top:1px solid[^>]*>[\s\S]*?QualiPulse[\s\S]*?<\/td>/);
        expect(footerMatch, "expected branded footer row with QualiPulse").toBeTruthy();
        // Plain-text version ends with the brand name as its sign-off.
        expect(text.trim().endsWith(BRAND.name) || text.includes(`\n${BRAND.name}`)).toBe(true);
      });

      if (v.overrides.isReminder) {
        it("shows the reminder banner for reminder sends", () => {
          expect(html).toMatch(/still needs your acknowledgement/i);
          expect(subject.toLowerCase()).toContain("reminder");
        });
      }
    });
  }
});
