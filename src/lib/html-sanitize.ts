// Minimal HTML sanitizer for AI-generated text before it lands in emails
// or the UI. We deliberately avoid a heavyweight dependency in the Worker
// runtime; the AI never legitimately needs HTML, so we treat everything as
// plain text and re-render safely.

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
  "/": "&#x2F;",
};

/** HTML-escape user- or AI-provided text. Use in every email/HTML template. */
export function escapeHtml(input: unknown): string {
  const s = input == null ? "" : String(input);
  return s.replace(/[&<>"'/]/g, (c) => HTML_ESCAPES[c] ?? c);
}

/**
 * Strip any HTML tags and control characters from AI output, then trim to
 * a maximum length. Returns plain, safe-to-render text.
 */
export function sanitizeAiText(input: unknown, maxChars = 4000): string {
  const raw = input == null ? "" : String(input);
  const noTags = raw.replace(/<[^>]*>/g, " ");
  const noCtrl = noTags.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
  const collapsed = noCtrl.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return collapsed.length > maxChars ? collapsed.slice(0, maxChars) + "…" : collapsed;
}

/**
 * Same as sanitizeAiText but returns HTML-escaped output ready to inline
 * inside an email template.
 */
export function sanitizeAiHtml(input: unknown, maxChars = 4000): string {
  return escapeHtml(sanitizeAiText(input, maxChars));
}
