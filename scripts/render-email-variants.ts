import { renderFeedbackEmail, type FeedbackEmailData, type FeedbackMetric } from "../src/lib/feedback-email.templates";
import { QUALITY_PARAMETERS } from "../src/lib/brand";
import { writeFileSync, mkdirSync } from "fs";

const LOGO = "https://dummyimage.com/180x36/16a34a/ffffff&text=QualiPulse";
const variants: Array<{ id: string; o: Partial<FeedbackEmailData> }> = [
  { id: "initial-chat-logo",    o: { interactionType: "chat", caseNumber: "QA-2027-000001", logoUrl: LOGO, isReminder: false } },
  { id: "initial-case-logo",    o: { interactionType: "case", caseNumber: "QA-2027-000042", logoUrl: LOGO, isReminder: false } },
  { id: "initial-chat-nologo",  o: { interactionType: "chat", caseNumber: "QA-2027-000123", logoUrl: null,  isReminder: false } },
  { id: "reminder-chat-logo",   o: { interactionType: "chat", caseNumber: "QA-2027-000777", logoUrl: LOGO, isReminder: true, reminderCount: 1 } },
  { id: "reminder-case-nologo", o: { interactionType: "case", caseNumber: "QA-2027-009999", logoUrl: null,  isReminder: true, reminderCount: 3 } },
  { id: "initial-case-ackdue",  o: { interactionType: "case", caseNumber: "QA-2027-000500", logoUrl: LOGO, isReminder: false, acknowledgementDueAt: "2027-01-15T10:00:00Z" } },
];

const metrics: FeedbackMetric[] = QUALITY_PARAMETERS.map((label, i) => ({
  label, score: 70 + i,
  maxPoints: [20,25,5,20,10,10,10][i],
  earnedPoints: [18,22,4,17,8,9,8][i],
}));

const base: FeedbackEmailData = {
  feedbackId: "fb-visual",
  title: "Quality Feedback",
  agentName: "Aisha Kumar",
  category: "customer_service",
  feedbackType: "quality",
  severity: "info",
  interactionType: "chat",
  interactionDate: "2027-01-10",
  score: null,
  summary: "Solid interaction overall.",
  strengths: "Great tone and empathetic language.",
  improvements: "Tighten closing summary.",
  recommendedActions: null,
  appBaseUrl: "https://app.qualipulse.test",
  metrics, logoUrl: null, senderName: "QualiPulse Feedback Team",
};

const outDir = process.argv[2] || "/tmp/email-visual/html";
mkdirSync(outDir, { recursive: true });
for (const v of variants) {
  const { html } = renderFeedbackEmail({ ...base, ...v.o });
  writeFileSync(`${outDir}/${v.id}.html`, html);
  console.log("wrote", v.id);
}
