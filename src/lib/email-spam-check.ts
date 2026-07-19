// Pre-send spam / deliverability heuristics.
// Pure function on rendered HTML (+ subject / text). Runs in the browser
// before firing a test send so staff can see risk before hitting provider.
//
// Not a replacement for SpamAssassin / provider reputation checks — it
// catches the common author-controllable issues: broken links, missing alt
// text, image-heavy layouts, ALL-CAPS / spammy phrases, oversized HTML.

export type SpamIssueSeverity = "info" | "warn" | "high";

export type EmailProviderId =
  | "gmail"
  | "sendgrid"
  | "resend"
  | "postmark"
  | "mailgun"
  | "ses"
  | (string & {});

export interface ProviderContext {
  /** Selected outbound provider (from email_settings.provider). */
  provider?: EmailProviderId | null;
  /** From: address the message will use. */
  senderEmail?: string | null;
  /** Reply-To header value (or null when unset). */
  replyTo?: string | null;
  /** Whether the outgoing MIME sets a List-Unsubscribe header. */
  hasListUnsubscribe?: boolean;
  /** Whether List-Unsubscribe-Post: List-Unsubscribe=One-Click is set. */
  hasOneClickUnsubscribe?: boolean;
  /**
   * Bulk / marketing send (>5k/day per Gmail & Yahoo guidelines). Defaults to
   * false — this app sends 1:1 transactional feedback.
   */
  isBulk?: boolean;
}

export interface SpamIssue {
  id: string;
  severity: SpamIssueSeverity;
  message: string;
  detail?: string;
  points: number; // contribution to risk score
}

export interface SpamCheckResult {
  score: number; // 0-100 (higher = riskier)
  level: "low" | "medium" | "high";
  issues: SpamIssue[];
  providerId: EmailProviderId | null;
  stats: {
    htmlBytes: number;
    imageCount: number;
    imagesMissingAlt: number;
    linkCount: number;
    brokenLinks: number;
    textLength: number;
    imageToTextRatio: number;
    capsRatio: number;
    exclamations: number;
    scriptCount: number;
    formCount: number;
    iframeCount: number;
  };
}

const FREEMAIL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "ymail.com",
  "hotmail.com", "outlook.com", "live.com", "aol.com", "icloud.com", "me.com",
  "proton.me", "protonmail.com", "gmx.com", "mail.com",
]);

function domainOf(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  return at < 0 ? null : email.slice(at + 1).trim().toLowerCase();
}

const SPAM_PHRASES = [
  "act now", "click here", "risk-free", "risk free", "100% free", "free money",
  "guaranteed", "winner", "cash bonus", "make money", "urgent", "buy now",
  "limited time", "no obligation", "double your", "earn extra", "get paid",
  "cheap", "viagra", "lottery", "prize", "congratulations you",
];

function isBrokenHref(href: string): boolean {
  if (!href) return true;
  const h = href.trim();
  if (!h) return true;
  if (h === "#" || h.startsWith("#")) return false; // in-doc anchor, tolerable
  if (h.toLowerCase().startsWith("javascript:")) return true;
  if (/\{\{|\}\}|\{%|%\}|\[\[|\]\]/.test(h)) return true; // unresolved template
  if (/^(https?:|mailto:|tel:)/i.test(h)) {
    if (/^https?:\/\/\s*$/i.test(h)) return true;
    if (/^https?:\/\/(localhost|127\.0\.0\.1|example\.(com|org|net))/i.test(h)) return true;
    try {
      // eslint-disable-next-line no-new
      new URL(h);
      return false;
    } catch {
      return true;
    }
  }
  // Relative or malformed
  return true;
}

function textFromHtml(root: Document | HTMLElement): string {
  const clone = (root as Document).body ? (root as Document).body.cloneNode(true) as HTMLElement : (root as HTMLElement).cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style, script, head").forEach((n) => n.remove());
  return (clone.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function analyzeEmailForSpamRisk(input: {
  html: string;
  subject?: string;
  text?: string;
  provider?: ProviderContext;
}): SpamCheckResult {
  const issues: SpamIssue[] = [];
  const html = input.html ?? "";
  const htmlBytes = new Blob([html]).size;

  // Parse in an inert document so no scripts run.
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html || "<html><body></body></html>", "text/html");
  } catch {
    doc = document.implementation.createHTMLDocument("empty");
  }

  const imgs = Array.from(doc.querySelectorAll("img"));
  const anchors = Array.from(doc.querySelectorAll("a"));
  const scripts = Array.from(doc.querySelectorAll("script"));
  const forms = Array.from(doc.querySelectorAll("form"));
  const iframes = Array.from(doc.querySelectorAll("iframe"));
  const text = textFromHtml(doc);
  const textLength = text.length;

  let imagesMissingAlt = 0;
  for (const img of imgs) {
    const alt = img.getAttribute("alt");
    if (alt === null || alt.trim() === "") imagesMissingAlt++;
  }

  let brokenLinks = 0;
  const brokenSamples: string[] = [];
  for (const a of anchors) {
    const href = a.getAttribute("href") ?? "";
    if (isBrokenHref(href)) {
      brokenLinks++;
      if (brokenSamples.length < 3) brokenSamples.push(href || "(empty)");
    }
  }

  const imageToTextRatio = textLength > 0 ? imgs.length / Math.max(1, textLength / 200) : imgs.length;

  const letters = text.replace(/[^A-Za-z]/g, "");
  const upper = text.replace(/[^A-Z]/g, "");
  const capsRatio = letters.length > 0 ? upper.length / letters.length : 0;
  const exclamations = (text.match(/!/g) ?? []).length;

  const subject = (input.subject ?? "").trim();
  const subjectUpper = subject.replace(/[^A-Z]/g, "").length;
  const subjectLetters = subject.replace(/[^A-Za-z]/g, "").length;
  const subjectCapsRatio = subjectLetters > 0 ? subjectUpper / subjectLetters : 0;

  const lowerHaystack = (subject + " " + text).toLowerCase();
  const phraseHits = SPAM_PHRASES.filter((p) => lowerHaystack.includes(p));

  const hasText = !!(input.text && input.text.trim().length > 20);

  // ----- scoring ---------------------------------------------------------
  if (brokenLinks > 0) {
    issues.push({
      id: "broken-links",
      severity: brokenLinks > 2 ? "high" : "warn",
      points: Math.min(35, 10 + brokenLinks * 8),
      message: `${brokenLinks} broken or unresolved link${brokenLinks === 1 ? "" : "s"}`,
      detail: `Examples: ${brokenSamples.join(", ")}`,
    });
  }

  if (imagesMissingAlt > 0) {
    issues.push({
      id: "missing-alt",
      severity: imagesMissingAlt > 2 ? "warn" : "info",
      points: Math.min(15, 4 + imagesMissingAlt * 3),
      message: `${imagesMissingAlt} image${imagesMissingAlt === 1 ? "" : "s"} missing alt text`,
      detail: "Screen readers and image-blocking clients fall back to alt text.",
    });
  }

  if (imgs.length >= 4 && imageToTextRatio > 0.6) {
    issues.push({
      id: "image-heavy",
      severity: imageToTextRatio > 1.2 ? "high" : "warn",
      points: imageToTextRatio > 1.2 ? 20 : 12,
      message: `Image-heavy layout (${imgs.length} images vs. ${textLength} chars of text)`,
      detail: "Spam filters penalise emails that are mostly images with little copy.",
    });
  }

  if (capsRatio > 0.35 && letters.length > 40) {
    issues.push({
      id: "shouting-body",
      severity: capsRatio > 0.55 ? "high" : "warn",
      points: capsRatio > 0.55 ? 18 : 10,
      message: `Body is ${Math.round(capsRatio * 100)}% uppercase`,
      detail: "Excessive ALL-CAPS reads as shouting and raises spam scores.",
    });
  }

  if (subjectCapsRatio > 0.5 && subjectLetters > 6) {
    issues.push({
      id: "shouting-subject",
      severity: "warn",
      points: 8,
      message: "Subject line is mostly uppercase",
    });
  }

  if (exclamations >= 3) {
    issues.push({
      id: "exclamations",
      severity: exclamations > 6 ? "warn" : "info",
      points: Math.min(10, exclamations),
      message: `${exclamations} exclamation marks in body`,
    });
  }

  if (phraseHits.length > 0) {
    issues.push({
      id: "spam-phrases",
      severity: phraseHits.length > 2 ? "high" : "warn",
      points: Math.min(25, 6 + phraseHits.length * 5),
      message: `${phraseHits.length} spam-trigger phrase${phraseHits.length === 1 ? "" : "s"} detected`,
      detail: phraseHits.slice(0, 4).join(", "),
    });
  }

  if (htmlBytes > 100 * 1024) {
    issues.push({
      id: "html-size",
      severity: htmlBytes > 200 * 1024 ? "high" : "warn",
      points: htmlBytes > 200 * 1024 ? 18 : 10,
      message: `HTML is ${(htmlBytes / 1024).toFixed(0)} KB`,
      detail: "Gmail clips messages larger than 102 KB, hiding tracking pixels and footers.",
    });
  }

  if (!hasText) {
    issues.push({
      id: "missing-plaintext",
      severity: "warn",
      points: 10,
      message: "No plain-text alternative",
      detail: "Providers prefer multipart emails with a matching text part.",
    });
  }

  if (textLength < 120 && imgs.length >= 1) {
    issues.push({
      id: "thin-copy",
      severity: "warn",
      points: 10,
      message: "Very little body copy",
      detail: "Short image-first emails are frequently classified as promotional.",
    });
  }

  if (!subject) {
    issues.push({
      id: "missing-subject",
      severity: "high",
      points: 25,
      message: "Subject line is empty",
    });
  } else if (subject.length > 100) {
    issues.push({
      id: "long-subject",
      severity: "info",
      points: 4,
      message: `Subject line is ${subject.length} characters`,
      detail: "Most clients truncate after ~70 characters.",
    });
  }

  const score = Math.min(100, issues.reduce((s, i) => s + i.points, 0));
  const level: SpamCheckResult["level"] = score >= 55 ? "high" : score >= 25 ? "medium" : "low";

  return {
    score,
    level,
    issues: issues.sort((a, b) => b.points - a.points),
    stats: {
      htmlBytes,
      imageCount: imgs.length,
      imagesMissingAlt,
      linkCount: anchors.length,
      brokenLinks,
      textLength,
      imageToTextRatio: Number(imageToTextRatio.toFixed(2)),
      capsRatio: Number(capsRatio.toFixed(2)),
      exclamations,
    },
  };
}
