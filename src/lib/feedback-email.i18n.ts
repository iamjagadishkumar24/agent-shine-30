// Localization dictionary for feedback emails. Brand name, tagline, and case
// number format are NEVER translated — those are contract invariants.
// Adding a new locale: add an entry to `FEEDBACK_EMAIL_LOCALES` below.

export type FeedbackEmailLocale = "en" | "es" | "fr" | "de" | "pt" | "ja";

export type FeedbackEmailStrings = {
  htmlLang: string;
  subjectQualityFeedback: string;             // subject stem, e.g. "Quality Feedback"
  subjectReminderPrefix: string;              // e.g. "Reminder: Acknowledgement Required"
  interactionCase: string;
  interactionChat: string;
  interactionGeneric: string;
  caseWord: string;                           // "Case" — used in "Case QA-2027-000500"
  greeting: (firstName: string, interaction: string) => string;
  metaCaseNumber: string;
  metaTitle: string;
  metaAgent: string;
  metaInteractionType: string;
  metaDate: string;
  qualityEvaluation: string;
  evaluationCriteria: string;
  scoreColumn: string;
  overallScoreRow: string;
  overallQualityScore: string;
  sectionSummary: string;
  sectionStrengths: string;
  sectionImprovements: string;
  reminderBanner: (n?: number) => string;
  ackRequired: string;
  ackBody: (caseNumber: string | null) => string;
  ackDueBy: (dateUtc: string) => string;
};

const en: FeedbackEmailStrings = {
  htmlLang: "en",
  subjectQualityFeedback: "Quality Feedback",
  subjectReminderPrefix: "Reminder: Acknowledgement Required",
  interactionCase: "Case",
  interactionChat: "Chat",
  interactionGeneric: "Interaction",
  caseWord: "Case",
  greeting: (n, i) => `Hello ${n}, a quality evaluation has been completed for your recent ${i} interaction.`,
  metaCaseNumber: "Case Number",
  metaTitle: "Feedback Title",
  metaAgent: "Agent",
  metaInteractionType: "Interaction Type",
  metaDate: "Date",
  qualityEvaluation: "Quality Evaluation",
  evaluationCriteria: "Evaluation Criteria",
  scoreColumn: "Score",
  overallScoreRow: "Overall Score",
  overallQualityScore: "Overall Quality Score",
  sectionSummary: "Summary",
  sectionStrengths: "Strengths",
  sectionImprovements: "Areas for Improvement",
  reminderBanner: (n) =>
    `Reminder${n ? ` #${n}` : ""} — this feedback still needs your acknowledgement.`,
  ackRequired: "Acknowledgement Required",
  ackBody: (c) =>
    c
      ? `Please review this quality feedback and acknowledge receipt by replying to this email — keep <strong>Case ${c}</strong> in the subject line so your reply is matched to this record.`
      : "Please review this quality feedback and acknowledge receipt by replying to this email.",
  ackDueBy: (d) => `Due by ${d}`,
};

const es: FeedbackEmailStrings = {
  htmlLang: "es",
  subjectQualityFeedback: "Evaluación de calidad",
  subjectReminderPrefix: "Recordatorio: se requiere acuse de recibo",
  interactionCase: "Caso",
  interactionChat: "Chat",
  interactionGeneric: "Interacción",
  caseWord: "Caso",
  greeting: (n, i) => `Hola ${n}, se ha completado una evaluación de calidad para tu reciente interacción de ${i}.`,
  metaCaseNumber: "Número de caso",
  metaTitle: "Título de la evaluación",
  metaAgent: "Agente",
  metaInteractionType: "Tipo de interacción",
  metaDate: "Fecha",
  qualityEvaluation: "Evaluación de calidad",
  evaluationCriteria: "Criterios de evaluación",
  scoreColumn: "Puntuación",
  overallScoreRow: "Puntuación total",
  overallQualityScore: "Puntuación total de calidad",
  sectionSummary: "Resumen",
  sectionStrengths: "Puntos fuertes",
  sectionImprovements: "Áreas de mejora",
  reminderBanner: (n) =>
    `Recordatorio${n ? ` n.º ${n}` : ""} — esta evaluación aún necesita tu acuse de recibo.`,
  ackRequired: "Se requiere acuse de recibo",
  ackBody: (c) =>
    c
      ? `Revisa esta evaluación de calidad y confirma su recepción respondiendo a este correo — mantén <strong>Caso ${c}</strong> en el asunto para que tu respuesta se asocie con este registro.`
      : "Revisa esta evaluación de calidad y confirma su recepción respondiendo a este correo.",
  ackDueBy: (d) => `Fecha límite: ${d}`,
};

const fr: FeedbackEmailStrings = {
  htmlLang: "fr",
  subjectQualityFeedback: "Évaluation qualité",
  subjectReminderPrefix: "Rappel : accusé de réception requis",
  interactionCase: "Dossier",
  interactionChat: "Chat",
  interactionGeneric: "Interaction",
  caseWord: "Dossier",
  greeting: (n, i) => `Bonjour ${n}, une évaluation qualité a été finalisée pour votre récente interaction ${i}.`,
  metaCaseNumber: "Numéro de dossier",
  metaTitle: "Titre de l'évaluation",
  metaAgent: "Agent",
  metaInteractionType: "Type d'interaction",
  metaDate: "Date",
  qualityEvaluation: "Évaluation qualité",
  evaluationCriteria: "Critères d'évaluation",
  scoreColumn: "Score",
  overallScoreRow: "Score global",
  overallQualityScore: "Score qualité global",
  sectionSummary: "Résumé",
  sectionStrengths: "Points forts",
  sectionImprovements: "Axes d'amélioration",
  reminderBanner: (n) =>
    `Rappel${n ? ` n° ${n}` : ""} — cette évaluation nécessite toujours votre accusé de réception.`,
  ackRequired: "Accusé de réception requis",
  ackBody: (c) =>
    c
      ? `Merci d'examiner cette évaluation qualité et d'en accuser réception en répondant à cet e-mail — conservez <strong>Dossier ${c}</strong> dans l'objet afin que votre réponse soit associée à ce dossier.`
      : "Merci d'examiner cette évaluation qualité et d'en accuser réception en répondant à cet e-mail.",
  ackDueBy: (d) => `À faire avant le ${d}`,
};

const de: FeedbackEmailStrings = {
  htmlLang: "de",
  subjectQualityFeedback: "Qualitätsfeedback",
  subjectReminderPrefix: "Erinnerung: Bestätigung erforderlich",
  interactionCase: "Vorgang",
  interactionChat: "Chat",
  interactionGeneric: "Interaktion",
  caseWord: "Vorgang",
  greeting: (n, i) => `Hallo ${n}, für Ihre kürzliche ${i}-Interaktion wurde eine Qualitätsbewertung abgeschlossen.`,
  metaCaseNumber: "Vorgangsnummer",
  metaTitle: "Titel der Bewertung",
  metaAgent: "Agent",
  metaInteractionType: "Interaktionstyp",
  metaDate: "Datum",
  qualityEvaluation: "Qualitätsbewertung",
  evaluationCriteria: "Bewertungskriterien",
  scoreColumn: "Punkte",
  overallScoreRow: "Gesamtpunktzahl",
  overallQualityScore: "Gesamtqualitätsbewertung",
  sectionSummary: "Zusammenfassung",
  sectionStrengths: "Stärken",
  sectionImprovements: "Verbesserungsbereiche",
  reminderBanner: (n) =>
    `Erinnerung${n ? ` Nr. ${n}` : ""} — für dieses Feedback fehlt noch Ihre Bestätigung.`,
  ackRequired: "Bestätigung erforderlich",
  ackBody: (c) =>
    c
      ? `Bitte prüfen Sie dieses Qualitätsfeedback und bestätigen Sie den Empfang, indem Sie auf diese E-Mail antworten — behalten Sie <strong>Vorgang ${c}</strong> in der Betreffzeile, damit Ihre Antwort diesem Datensatz zugeordnet wird.`
      : "Bitte prüfen Sie dieses Qualitätsfeedback und bestätigen Sie den Empfang, indem Sie auf diese E-Mail antworten.",
  ackDueBy: (d) => `Fällig bis ${d}`,
};

const pt: FeedbackEmailStrings = {
  htmlLang: "pt",
  subjectQualityFeedback: "Avaliação de qualidade",
  subjectReminderPrefix: "Lembrete: confirmação necessária",
  interactionCase: "Caso",
  interactionChat: "Chat",
  interactionGeneric: "Interação",
  caseWord: "Caso",
  greeting: (n, i) => `Olá ${n}, foi concluída uma avaliação de qualidade da sua interação recente de ${i}.`,
  metaCaseNumber: "Número do caso",
  metaTitle: "Título da avaliação",
  metaAgent: "Agente",
  metaInteractionType: "Tipo de interação",
  metaDate: "Data",
  qualityEvaluation: "Avaliação de qualidade",
  evaluationCriteria: "Critérios de avaliação",
  scoreColumn: "Pontuação",
  overallScoreRow: "Pontuação total",
  overallQualityScore: "Pontuação total de qualidade",
  sectionSummary: "Resumo",
  sectionStrengths: "Pontos fortes",
  sectionImprovements: "Áreas de melhoria",
  reminderBanner: (n) =>
    `Lembrete${n ? ` nº ${n}` : ""} — esta avaliação ainda precisa da sua confirmação.`,
  ackRequired: "Confirmação necessária",
  ackBody: (c) =>
    c
      ? `Analise esta avaliação de qualidade e confirme o recebimento respondendo a este e-mail — mantenha <strong>Caso ${c}</strong> no assunto para que a resposta seja associada a este registro.`
      : "Analise esta avaliação de qualidade e confirme o recebimento respondendo a este e-mail.",
  ackDueBy: (d) => `Prazo: ${d}`,
};

const ja: FeedbackEmailStrings = {
  htmlLang: "ja",
  subjectQualityFeedback: "品質フィードバック",
  subjectReminderPrefix: "リマインダー: 受領確認が必要です",
  interactionCase: "ケース",
  interactionChat: "チャット",
  interactionGeneric: "対応",
  caseWord: "ケース",
  greeting: (n, i) => `${n} 様、最近の${i}対応について品質評価が完了しました。`,
  metaCaseNumber: "ケース番号",
  metaTitle: "評価タイトル",
  metaAgent: "担当者",
  metaInteractionType: "対応種別",
  metaDate: "日付",
  qualityEvaluation: "品質評価",
  evaluationCriteria: "評価項目",
  scoreColumn: "スコア",
  overallScoreRow: "総合スコア",
  overallQualityScore: "総合品質スコア",
  sectionSummary: "サマリー",
  sectionStrengths: "強み",
  sectionImprovements: "改善が必要な点",
  reminderBanner: (n) =>
    `リマインダー${n ? ` #${n}` : ""} — このフィードバックにはまだ受領確認が必要です。`,
  ackRequired: "受領確認が必要です",
  ackBody: (c) =>
    c
      ? `この品質フィードバックをご確認のうえ、このメールに返信して受領を確認してください。返信が本レコードに紐づくよう、件名に <strong>ケース ${c}</strong> を残してください。`
      : "この品質フィードバックをご確認のうえ、このメールに返信して受領を確認してください。",
  ackDueBy: (d) => `期限: ${d}`,
};

export const FEEDBACK_EMAIL_LOCALES: Record<FeedbackEmailLocale, FeedbackEmailStrings> = {
  en,
  es,
  fr,
  de,
  pt,
  ja,
};

export function resolveFeedbackEmailStrings(
  locale?: string | null,
): FeedbackEmailStrings {
  if (!locale) return en;
  const base = locale.toLowerCase().split(/[-_]/)[0] as FeedbackEmailLocale;
  return FEEDBACK_EMAIL_LOCALES[base] ?? en;
}
