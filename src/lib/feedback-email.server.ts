// Server-only email sender. Uses Resend via connector-gateway if configured,
// otherwise records a "send_skipped" event so the rest of the pipeline works.

type SendArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
  fromName?: string;
};

export type SendResult =
  | { ok: true; messageId?: string; provider: string }
  | { ok: false; error: string; provider: string };

export async function sendTransactionalEmail(args: SendArgs): Promise<SendResult> {
  const resendKey = process.env.RESEND_API_KEY;
  const lovableKey = process.env.LOVABLE_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS;

  if (!fromAddress) {
    return { ok: false, error: "EMAIL_FROM_ADDRESS not configured", provider: "none" };
  }

  const from = args.fromName ? `${args.fromName} <${fromAddress}>` : fromAddress;

  // Prefer Resend via Lovable connector gateway
  if (resendKey && lovableKey) {
    try {
      const res = await fetch("https://connector-gateway.lovable.dev/resend/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": resendKey,
        },
        body: JSON.stringify({
          from,
          to: [args.to],
          subject: args.subject,
          html: args.html,
          text: args.text,
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, error: `Resend ${res.status}: ${body}`, provider: "resend" };
      }
      const data = (await res.json()) as { id?: string };
      return { ok: true, messageId: data.id, provider: "resend" };
    } catch (e) {
      return { ok: false, error: (e as Error).message, provider: "resend" };
    }
  }

  return { ok: false, error: "No email provider configured (set up Lovable Emails or Resend)", provider: "none" };
}
