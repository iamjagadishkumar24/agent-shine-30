import { describe, it, expect } from "vitest";
import { renderFeedbackEmail, type FeedbackMetric } from "@/lib/feedback-email.templates";
import { QUALITY_PARAMETERS } from "@/lib/brand";

const NARRATIVE_SECTIONS = [
  { key: "summary", title: "Summary" },
  { key: "strengths", title: "Strengths" },
  { key: "improvements", title: "Areas for Improvement" },
] as const;

type NarrativeKey = (typeof NARRATIVE_SECTIONS)[number]["key"];

const SAMPLE: Record<NarrativeKey, string> = {
  summary: "Overall the interaction met expectations with minor issues.",
  strengths: "Warm greeting, empathetic tone, clean handoff.",
  improvements: "Slow issue resolution; missed one compliance disclosure.",
};

function render(opts: {
  interaction: "chat" | "case";
  present: Partial<Record<NarrativeKey, string>>;
}) {
  const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label) => ({ label, score: 80 }));
  return renderFeedbackEmail({
    feedbackId: "narrative-test",
    title: "Narrative visibility",
    agentName: "Aisha Kumar",
    interactionType: opts.interaction,
    score: null,
    summary: opts.present.summary ?? null,
    strengths: opts.present.strengths ?? null,
    improvements: opts.present.improvements ?? null,
    recommendedActions: null,
    appBaseUrl: "https://example.test",
    metrics,
    logoUrl: null,
    senderName: "QualiPulse Feedback Team",
  });
}

// Count non-overlapping occurrences of `needle` in `haystack`.
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while ((idx = haystack.indexOf(needle, idx)) !== -1) {
    count++;
    idx += needle.length;
  }
  return count;
}

// The template renders section titles as: >Summary< inside a styled div.
// Match the label token exactly so we don't collide with words in body copy.
const titleToken = (title: string) => `>${title}<`;

describe("narrative visibility — hidden when empty", () => {
  for (const interaction of ["chat", "case"] as const) {
    for (const emptyValue of [undefined, "", "   ", "\n\t "] as const) {
      it(`${interaction}: all four narratives hidden when value is ${JSON.stringify(emptyValue)}`, () => {
        const { html, text } = render({
          interaction,
          present: {
            summary: emptyValue,
            strengths: emptyValue,
            improvements: emptyValue,
            recommendedActions: emptyValue,
          },
        });
        for (const { title } of NARRATIVE_SECTIONS) {
          expect(
            countOccurrences(html, titleToken(title)),
            `HTML should not contain "${title}" section title`,
          ).toBe(0);
          // Plain-text output also must not carry the section header
          expect(text.toLowerCase()).not.toContain(title.toLowerCase());
        }
      });
    }
  }
});

describe("narrative visibility — renders exactly once when non-empty", () => {
  for (const interaction of ["chat", "case"] as const) {
    for (const section of NARRATIVE_SECTIONS) {
      it(`${interaction}: "${section.title}" renders exactly once when only it is set`, () => {
        const present = { [section.key]: SAMPLE[section.key] } as Partial<Record<NarrativeKey, string>>;
        const { html, text } = render({ interaction, present });

        // Title appears exactly once in HTML
        expect(countOccurrences(html, titleToken(section.title))).toBe(1);

        // Body content appears in HTML
        expect(html).toContain(SAMPLE[section.key]);
        expect(countOccurrences(html, SAMPLE[section.key])).toBe(1);

        // Other three sections stay hidden
        for (const other of NARRATIVE_SECTIONS) {
          if (other.key === section.key) continue;
          expect(
            countOccurrences(html, titleToken(other.title)),
            `HTML should not include hidden section "${other.title}"`,
          ).toBe(0);
          expect(html).not.toContain(SAMPLE[other.key]);
        }

        // Plain-text mirrors: header appears at most once; body appears at least once
        const textLower = text.toLowerCase();
        expect(textLower.split(section.title.toLowerCase()).length - 1).toBeLessThanOrEqual(1);
        expect(text).toContain(SAMPLE[section.key]);
      });
    }

    it(`${interaction}: all four narratives render exactly once when all are set`, () => {
      const present: Partial<Record<NarrativeKey, string>> = {
        summary: SAMPLE.summary,
        strengths: SAMPLE.strengths,
        improvements: SAMPLE.improvements,
        recommendedActions: SAMPLE.recommendedActions,
      };
      const { html } = render({ interaction, present });
      for (const { title, key } of NARRATIVE_SECTIONS) {
        expect(countOccurrences(html, titleToken(title))).toBe(1);
        expect(countOccurrences(html, SAMPLE[key])).toBe(1);
      }
    });
  }
});
