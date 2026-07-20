/**
 * Generate & auto-verify test feedback emails.
 *
 * Cases: Chat / Case × { all 0%, all 100%, decimal average, partial narratives }
 *
 * Assertions per rendered email:
 *   - Exactly the 7 canonical parameters appear, in canonical order.
 *   - Each parameter's rendered %% matches the input, formatted to 1 decimal.
 *   - The Overall Quality Score in the email equals sum(scores)/7 formatted to 1 decimal.
 *   - The interaction label is "Chat" or "Case" as configured.
 *   - Empty narrative blocks are omitted; non-empty ones appear once.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { renderFeedbackEmail, type FeedbackMetric } from "../src/lib/feedback-email.templates";
import { QUALITY_PARAMETERS, computeOverallScore } from "../src/lib/brand";

type Case = {
  id: string;
  interaction: "chat" | "case";
  scores: number[];
  narratives: {
    summary?: string;
    strengths?: string;
    improvements?: string;
    recommendedActions?: string;
  };
};

const fmt = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)}%`;

const cases: Case[] = [
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

type Failure = { case: string; message: string };
const failures: Failure[] = [];
const summaryRows: string[] = [];

mkdirSync("/mnt/documents/feedback-email-verification", { recursive: true });

for (const c of cases) {
  const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label, i) => ({ label, score: c.scores[i] }));
  const expectedOverall = computeOverallScore(c.scores);
  const rendered = renderFeedbackEmail({
    feedbackId: `test-${c.id}`,
    title: `Test — ${c.id}`,
    agentName: "Aisha Kumar",
    category: "customer_service",
    feedbackType: "quality",
    severity: "info",
    interactionType: c.interaction,
    score: expectedOverall,
    summary: c.narratives.summary ?? null,
    strengths: c.narratives.strengths ?? null,
    improvements: c.narratives.improvements ?? null,
    recommendedActions: c.narratives.recommendedActions ?? null,
    appBaseUrl: "https://example.test",
    metrics,
    logoUrl: null,
  });

  const html = rendered.html;
  const fail = (msg: string) => failures.push({ case: c.id, message: msg });

  // 1. Parameter order & full set
  const labelPositions = QUALITY_PARAMETERS.map((label) => html.indexOf(label));
  if (labelPositions.some((p) => p < 0)) {
    fail(`Missing parameter labels: ${QUALITY_PARAMETERS.filter((_, i) => labelPositions[i] < 0).join(", ")}`);
  } else {
    for (let i = 1; i < labelPositions.length; i++) {
      if (labelPositions[i] <= labelPositions[i - 1]) {
        fail(`Parameter order broken between "${QUALITY_PARAMETERS[i - 1]}" and "${QUALITY_PARAMETERS[i]}"`);
        break;
      }
    }
  }

  // 2. Each parameter's rendered percentage matches input
  for (let i = 0; i < QUALITY_PARAMETERS.length; i++) {
    const label = QUALITY_PARAMETERS[i];
    const expected = fmt(c.scores[i]);
    // Grab the row snippet after this label up to the closing </tr>
    const start = html.indexOf(label);
    const end = html.indexOf("</tr>", start);
    const slice = html.slice(start, end);
    if (!slice.includes(`>${expected}<`)) {
      fail(`Row for "${label}" does not contain expected ${expected}. Slice: ${slice.replace(/\s+/g, " ").slice(0, 200)}`);
    }
  }

  // 3. Overall score matches sum/7 formatted to 1 decimal, once, in the hero block
  const expectedOverallLabel = fmt(expectedOverall);
  const overallMatches = html.match(/Overall Quality Score[\s\S]{0,400}?>([0-9]+\.[0-9]%)</);
  if (!overallMatches) fail(`Overall Quality Score block not found`);
  else if (overallMatches[1] !== expectedOverallLabel) {
    fail(`Overall Quality Score is ${overallMatches[1]}, expected ${expectedOverallLabel}`);
  }

  // 4. Interaction label
  const expectedInteraction = c.interaction === "chat" ? "Chat" : "Case";
  if (!html.includes(`recent ${expectedInteraction} interaction`)) {
    fail(`Interaction label not "${expectedInteraction}"`);
  }

  // 5. Narrative visibility
  const narrativeChecks: Array<[string, string | undefined]> = [
    ["Summary", c.narratives.summary],
    ["Strengths", c.narratives.strengths],
    ["Areas to Improve", c.narratives.improvements],
    ["Recommended Actions", c.narratives.recommendedActions],
  ];
  for (const [title, body] of narrativeChecks) {
    const present = html.includes(`>${title}<`);
    const shouldShow = !!(body && body.trim());
    if (shouldShow && !present) fail(`Narrative "${title}" expected but missing`);
    if (!shouldShow && present) fail(`Narrative "${title}" should be hidden but is present`);
    if (shouldShow && body && !html.includes(body.replace(/</g, "&lt;"))) {
      // template escapes user content; check on escaped body
      fail(`Narrative "${title}" body not rendered in HTML`);
    }
  }

  // Write artifacts for human inspection
  writeFileSync(`/mnt/documents/feedback-email-verification/${c.id}.html`, html);
  writeFileSync(`/mnt/documents/feedback-email-verification/${c.id}.txt`, rendered.text);

  summaryRows.push(
    `${c.id.padEnd(14)}  interaction=${c.interaction.padEnd(4)}  scores=[${c.scores.join(",")}]  expected=${expectedOverallLabel}  status=${failures.filter((f) => f.case === c.id).length === 0 ? "PASS" : "FAIL"}`,
  );
}

console.log("\n=== Feedback Email Verification ===");
for (const row of summaryRows) console.log(row);
console.log("");

if (failures.length) {
  console.error(`\n✗ ${failures.length} assertion(s) failed:\n`);
  for (const f of failures) console.error(`  [${f.case}] ${f.message}`);
  process.exit(1);
}

console.log(`✓ All ${cases.length} cases passed. Artifacts: /mnt/documents/feedback-email-verification/`);
