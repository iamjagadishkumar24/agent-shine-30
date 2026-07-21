// End-to-end rendering contract for LOCALIZED feedback emails.
// Regardless of locale, every rendered email MUST include: the QualiPulse
// logo (when logoUrl is set), the brand name + tagline in the header, a
// QA-YYYY-NNNNNN case number, a localized acknowledgement notice, and the
// branded footer. The brand name, tagline, and case-number format are
// language-invariants — they NEVER get translated.
import { describe, it, expect } from "vitest";
import { renderFeedbackEmail, type FeedbackMetric, type FeedbackEmailData } from "@/lib/feedback-email.templates";
import { BRAND, QUALITY_PARAMETERS } from "@/lib/brand";
import {
  FEEDBACK_EMAIL_LOCALES,
  resolveFeedbackEmailStrings,
  type FeedbackEmailLocale,
} from "@/lib/feedback-email.i18n";

const CASE_NUMBER_RE = /QA-\d{4}-\d{6}/;
const LOGO_URL = "https://cdn.qualipulse.test/logo.png";

const locales = Object.keys(FEEDBACK_EMAIL_LOCALES) as FeedbackEmailLocale[];

type Variant = {
  name: string;
  overrides: Partial<FeedbackEmailData>;
};

const variants: Variant[] = [
  { name: "initial · chat · with logo",   overrides: { interactionType: "chat", caseNumber: "QA-2025-000001", logoUrl: LOGO_URL, isReminder: false } },
  { name: "initial · case · without logo", overrides: { interactionType: "case", caseNumber: "QA-2026-000042", logoUrl: null,    isReminder: false } },
  { name: "reminder · case · with logo",  overrides: { interactionType: "case", caseNumber: "QA-2027-000777", logoUrl: LOGO_URL, isReminder: true, reminderCount: 2 } },
  { name: "initial · case · ack due",     overrides: { interactionType: "case", caseNumber: "QA-2028-000500", logoUrl: LOGO_URL, isReminder: false, acknowledgementDueAt: "2028-03-15T10:00:00Z" } },
];

function buildData(v: Variant, locale: FeedbackEmailLocale): FeedbackEmailData {
  const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label, i) => ({
    label,
    score: 70 + i,
    maxPoints: [20, 25, 5, 20, 10, 10, 10][i],
    earnedPoints: [18, 22, 4, 17, 8, 9, 8][i],
  }));
  return {
    feedbackId: `fb-i18n-${locale}`,
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
    locale,
    ...v.overrides,
  };
}

describe("feedback email localization contract", () => {
  for (const locale of locales) {
    const t = resolveFeedbackEmailStrings(locale);

    describe(`locale=${locale}`, () => {
      for (const v of variants) {
        describe(v.name, () => {
          const data = buildData(v, locale);
          const { subject, html, text } = renderFeedbackEmail(data);

          it("keeps the QualiPulse brand name in the header (never translated)", () => {
            expect(BRAND.name).toBe("QualiPulse");
            expect(html).toContain(BRAND.name);
            // Header block: brand name div sits directly next to the tagline div.
            expect(html).toMatch(
              /font:800 20px\/1\.15[^;]+;color:#0f172a;letter-spacing:-0\.01em;">QualiPulse<\/div>/,
            );
          });

          it("keeps the brand tagline in the header (never translated)", () => {
            expect(html).toContain(BRAND.tagline);
          });

          it("renders the logo <img> with alt=\"QualiPulse\" when logoUrl is set", () => {
            if (data.logoUrl) {
              expect(html).toContain(`src="${data.logoUrl}"`);
              expect(html).toMatch(/<img[^>]+alt="QualiPulse"/);
            } else {
              expect(html).not.toContain(`src="${LOGO_URL}"`);
            }
          });

          it("emits a QA-YYYY-NNNNNN case number in html, subject, and text", () => {
            expect(data.caseNumber).toMatch(CASE_NUMBER_RE);
            expect(html).toMatch(CASE_NUMBER_RE);
            expect(subject).toContain(data.caseNumber!);
            expect(text).toMatch(CASE_NUMBER_RE);
            // Case-number format is a global contract — the digit pattern must
            // survive translation of the surrounding "Case" word.
            expect(html).toContain(`${t.caseWord} ${data.caseNumber}`);
          });

          it("uses the localized acknowledgement notice", () => {
            expect(html).toContain(t.ackRequired);
            expect(text).toContain(t.ackRequired);
            // Body copy — pick a locale-specific fragment that is unlikely to
            // collide with English defaults.
            const bodyProbe = t.ackBody(null).replace(/<[^>]+>/g, "").slice(0, 24);
            expect(html).toContain(bodyProbe);
          });

          it("uses the localized quality-evaluation section header", () => {
            expect(html).toContain(t.qualityEvaluation);
            expect(html).toContain(t.evaluationCriteria);
            expect(html).toContain(t.scoreColumn);
            expect(html).toContain(t.overallScoreRow);
            expect(html).toContain(t.overallQualityScore);
          });

          it("uses the localized narrative section titles", () => {
            expect(html).toContain(t.sectionSummary);
            expect(html).toContain(t.sectionStrengths);
            expect(html).toContain(t.sectionImprovements);
            expect(text).toContain(t.sectionSummary);
          });

          it("sets the correct <html lang=…> attribute", () => {
            expect(html).toContain(`<html lang="${t.htmlLang}">`);
          });

          it("localizes the subject line while keeping the case number verbatim", () => {
            if (v.overrides.isReminder) {
              expect(subject.startsWith(t.subjectReminderPrefix)).toBe(true);
            } else {
              expect(subject.startsWith(t.subjectQualityFeedback)).toBe(true);
            }
            expect(subject).toContain(data.caseNumber!);
          });

          it("renders the branded footer with QualiPulse as the sign-off", () => {
            const footerMatch = html.match(/border-top:1px solid[^>]*>[\s\S]*?QualiPulse[\s\S]*?<\/td>/);
            expect(footerMatch, "expected branded footer row with QualiPulse").toBeTruthy();
            expect(text.trim().endsWith(BRAND.name) || text.includes(`\n${BRAND.name}`)).toBe(true);
          });

          if (v.overrides.isReminder) {
            it("shows the localized reminder banner", () => {
              const banner = t.reminderBanner(v.overrides.reminderCount as number | undefined);
              expect(html).toContain(banner);
            });
          }

          if (v.overrides.acknowledgementDueAt) {
            it("shows the localized 'due by' line", () => {
              const dueUtc = new Date(v.overrides.acknowledgementDueAt as string).toUTCString();
              expect(html).toContain(t.ackDueBy(dueUtc));
            });
          }
        });
      }
    });
  }

  it("falls back to English for unknown or malformed locales", () => {
    const en = resolveFeedbackEmailStrings("en");
    expect(resolveFeedbackEmailStrings(null)).toEqual(en);
    expect(resolveFeedbackEmailStrings("")).toEqual(en);
    expect(resolveFeedbackEmailStrings("xx")).toEqual(en);
    expect(resolveFeedbackEmailStrings("klingon-KL")).toEqual(en);
  });

  it("resolves regional variants to their base locale (fr-CA → fr)", () => {
    expect(resolveFeedbackEmailStrings("fr-CA").htmlLang).toBe("fr");
    expect(resolveFeedbackEmailStrings("pt_BR").htmlLang).toBe("pt");
    expect(resolveFeedbackEmailStrings("EN-US").htmlLang).toBe("en");
  });
});
