// Server-only email provider abstraction. All providers implement the same
// interface so the admin can switch providers from Settings without any code
// change. Only import this file from *.functions.ts handlers or other server
// modules — never from route/component modules.

export type EmailAttachment = {
  filename: string;
  mimeType: string;
  contentBase64: string;
};

export type SendArgs = {
  from: { name: string; email: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  html: string;
  text: string;
  attachments?: EmailAttachment[];
  headers?: Record<string, string>;
};

export type SendResult =
  | { ok: true; messageId?: string; provider: string }
  | { ok: false; error: string; provider: string };

export interface EmailProvider {
  id: string;
  displayName: string;
  verify(): Promise<{ ok: true; account?: string } | { ok: false; error: string }>;
  send(args: SendArgs): Promise<SendResult>;
}

// ---------------------------------------------------------------------------
// Raw RFC 2822 assembly (base64url of a multipart/mixed with html+text+atts)
// ---------------------------------------------------------------------------

const encodeBase64Url = (s: Buffer | string): string => {
  const buf = typeof s === "string" ? Buffer.from(s, "utf8") : s;
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

// Encode non-ASCII header values (e.g. sender display names) per RFC 2047.
function encodeHeader(v: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(v)) return v;
  return `=?UTF-8?B?${Buffer.from(v, "utf8").toString("base64")}?=`;
}

function chunk76(base64: string): string {
  return base64.match(/.{1,76}/g)?.join("\r\n") ?? base64;
}

export function buildRawMime(args: SendArgs): string {
  const boundaryMixed = `mixed_${Math.random().toString(36).slice(2)}`;
  const boundaryAlt = `alt_${Math.random().toString(36).slice(2)}`;
  const fromHeader = args.from.name
    ? `${encodeHeader(args.from.name)} <${args.from.email}>`
    : args.from.email;

  const headers: string[] = [
    `From: ${fromHeader}`,
    `To: ${args.to}`,
    `Subject: ${encodeHeader(args.subject)}`,
    `MIME-Version: 1.0`,
  ];
  if (args.replyTo) headers.push(`Reply-To: ${args.replyTo}`);
  if (args.headers) for (const [k, v] of Object.entries(args.headers)) headers.push(`${k}: ${v}`);

  const hasAttachments = (args.attachments?.length ?? 0) > 0;
  const outerBoundary = hasAttachments ? boundaryMixed : boundaryAlt;
  headers.push(
    `Content-Type: ${hasAttachments ? "multipart/mixed" : "multipart/alternative"}; boundary="${outerBoundary}"`,
  );

  const altPart =
    `--${boundaryAlt}\r\n` +
    `Content-Type: text/plain; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    chunk76(Buffer.from(args.text, "utf8").toString("base64")) +
    `\r\n\r\n--${boundaryAlt}\r\n` +
    `Content-Type: text/html; charset="UTF-8"\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    chunk76(Buffer.from(args.html, "utf8").toString("base64")) +
    `\r\n\r\n--${boundaryAlt}--\r\n`;

  let body: string;
  if (hasAttachments) {
    const altWrapped =
      `--${boundaryMixed}\r\n` +
      `Content-Type: multipart/alternative; boundary="${boundaryAlt}"\r\n\r\n` +
      altPart +
      `\r\n`;
    const attParts = (args.attachments ?? [])
      .map(
        (a) =>
          `--${boundaryMixed}\r\n` +
          `Content-Type: ${a.mimeType}; name="${a.filename.replace(/"/g, "")}"\r\n` +
          `Content-Disposition: attachment; filename="${a.filename.replace(/"/g, "")}"\r\n` +
          `Content-Transfer-Encoding: base64\r\n\r\n` +
          chunk76(a.contentBase64) +
          `\r\n`,
      )
      .join("");
    body = altWrapped + attParts + `--${boundaryMixed}--\r\n`;
  } else {
    body = altPart;
  }

  const raw = headers.join("\r\n") + "\r\n\r\n" + body;
  return encodeBase64Url(raw);
}

// ---------------------------------------------------------------------------
// Gmail provider (via Lovable connector gateway)
// ---------------------------------------------------------------------------

const GMAIL_BASE = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function gatewayHeaders(): HeadersInit | null {
  const lovable = process.env.LOVABLE_API_KEY;
  const gmail = process.env.GOOGLE_MAIL_API_KEY;
  if (!lovable || !gmail) return null;
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gmail,
    "Content-Type": "application/json",
  };
}

export const gmailProvider: EmailProvider = {
  id: "gmail",
  displayName: "Gmail (OAuth)",
  async verify() {
    const headers = gatewayHeaders();
    if (!headers) return { ok: false, error: "Gmail connector is not linked" };
    try {
      const res = await fetch(`${GMAIL_BASE}/users/me/profile`, { headers });
      if (!res.ok) return { ok: false, error: `Gmail verify ${res.status}: ${await res.text()}` };
      const j = (await res.json()) as { emailAddress?: string };
      return { ok: true, account: j.emailAddress };
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  },
  async send(args) {
    const headers = gatewayHeaders();
    if (!headers) return { ok: false, error: "Gmail connector is not linked", provider: "gmail" };
    try {
      const raw = buildRawMime(args);
      const res = await fetch(`${GMAIL_BASE}/users/me/messages/send`, {
        method: "POST",
        headers,
        body: JSON.stringify({ raw }),
      });
      if (!res.ok) {
        return { ok: false, error: `Gmail send ${res.status}: ${await res.text()}`, provider: "gmail" };
      }
      const j = (await res.json()) as { id?: string };
      return { ok: true, messageId: j.id, provider: "gmail" };
    } catch (e) {
      return { ok: false, error: (e as Error).message, provider: "gmail" };
    }
  },
};

// ---------------------------------------------------------------------------
// Provider registry — add SendGrid / SES / Graph / Resend adapters here.
// ---------------------------------------------------------------------------

const REGISTRY: Record<string, EmailProvider> = {
  gmail: gmailProvider,
};

export function getProvider(id: string | null | undefined): EmailProvider {
  const key = (id ?? "gmail").toLowerCase();
  return REGISTRY[key] ?? gmailProvider;
}
