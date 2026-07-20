import { describe, it, expect } from "vitest";
import { renderFeedbackEmail, type FeedbackMetric } from "@/lib/feedback-email.templates";
import { QUALITY_PARAMETERS } from "@/lib/brand";

type Scenario = {
  id: string;
  interaction: "chat" | "case";
  scores: [number, number, number, number, number, number, number];
  narratives: {
    summary?: string;
    strengths?: string;
    improvements?: string;
    recommendedActions?: string;
  };
};

const scenarios: Scenario[] = [
  { id: "chat-zero",    interaction: "chat", scores: [0, 0, 0, 0, 0, 0, 0], narratives: { summary: "Full miss across the board." } },
  { id: "chat-perfect", interaction: "chat", scores: [100, 100, 100, 100, 100, 100, 100], narratives: { strengths: "Excellent on every parameter." } },
  { id: "chat-decimal", interaction: "chat", scores: [85, 90, 72, 68, 95, 80, 77], narratives: {
      summary: "Solid chat with a couple of gaps.",
      strengths: "Warm greeting, empathetic tone.",
      improvements: "Slow on issue resolution; missed compliance disclosure.",
      recommendedActions: "Review KB article #4521 and shadow a senior agent this week.",
    } },
  { id: "case-zero",    interaction: "case", scores: [0, 0, 0, 0, 0, 0, 0], narratives: {} },
  { id: "case-perfect", interaction: "case", scores: [100, 100, 100, 100, 100, 100, 100], narratives: {} },
  { id: "case-partial", interaction: "case", scores: [90, 60, 100, 45, 88, 100, 30], narratives: {
      strengths: "Perfect product knowledge and compliance.",
      recommendedActions: "Add a clearer closing summary and next-steps line.",
    } },
];

function render(s: Scenario) {
  const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label, i) => ({ label, score: s.scores[i] }));
  return renderFeedbackEmail({
    feedbackId: `snapshot-${s.id}`,
    title: `Snapshot — ${s.id}`,
    agentName: "Aisha Kumar",
    category: "customer_service",
    feedbackType: "quality",
    severity: "info",
    interactionType: s.interaction,
    score: null,
    summary: s.narratives.summary ?? null,
    strengths: s.narratives.strengths ?? null,
    improvements: s.narratives.improvements ?? null,
    recommendedActions: s.narratives.recommendedActions ?? null,
    appBaseUrl: "https://example.test",
    metrics,
    logoUrl: null,
    senderName: "QualiPulse Feedback Team",
  });
}

describe("feedback email template snapshots", () => {
  for (const s of scenarios) {
    it(`${s.id} — HTML output is stable`, () => {
      const { html } = render(s);
      expect(html).toMatchSnapshot();
    });

    it(`${s.id} — plain-text output is stable`, () => {
      const { text } = render(s);
      expect(text).toMatchSnapshot();
    });

    it(`${s.id} — subject line is stable`, () => {
      const { subject } = render(s);
      expect(subject).toMatchSnapshot();
    });
  }
});
