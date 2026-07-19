// Provider webhook endpoint for email delivery events.
//
// URL:  /api/public/webhooks/email/{provider}
// Providers: resend | sendgrid | postmark | mailgun
//
// Configure the corresponding webhook signing secret in Lovable Cloud:
//   EMAIL_WEBHOOK_SECRET_RESEND      (Svix `whsec_...`)
//   EMAIL_WEBHOOK_SECRET_SENDGRID    (Signed Event Webhook — set the ECDSA
//                                     PUBLIC KEY here, PEM or base64 body)
//   EMAIL_WEBHOOK_SECRET_POSTMARK    (any strong string; add to Basic Auth
//                                     header the provider sends)
//   EMAIL_WEBHOOK_SECRET_MAILGUN     (Mailgun HTTP webhook signing key)
//
// The endpoint verifies the provider signature, matches the message id back
// to public.email_queue, and progresses status to delivered / bounced /
// deferred / complained. Every call is logged to public.email_webhook_events
// including verification failures.
//
// Gmail (the built-in provider) does not emit delivery webhooks — bounces
// arrive as DSN emails in the sender inbox. Provider acceptance ("sent") is
// the terminal state we can report for that provider.

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual, createVerify } from "node:crypto";

type NormalizedEvent = {
  provider: string;
  eventType: string;
  status: "delivered" | "bounced" | "deferred" | "complained" | "opened" | "clicked" | "unknown";
  providerMessageId: string | null;
  recipient: string | null;
  reason: string | null;
  occurredAt: string;
  raw: unknown;
};

// ---------- signature verification ----------

function bufEq(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

// Resend uses Svix. Header: svix-id, svix-timestamp, svix-signature ("v1,<b64>").
function verifyResend(headers: Headers, rawBody: string, secret: string): boolean {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sig = headers.get("svix-signature");
  if (!id || !ts || !sig) return false;
  const key = secret.startsWith("whsec_") ? Buffer.from(secret.slice(6), "base64") : Buffer.from(secret);
  const signed = `${id}.${ts}.${rawBody}`;
  const expected = createHmac("sha256", key).update(signed).digest("base64");
  return sig
    .split(" ")
    .map((p) => p.trim())
    .some((p) => p.startsWith("v1,") && bufEq(p.slice(3), expected));
}

// SendGrid Signed Event Webhook (ECDSA over timestamp+body, public key set as secret).
function verifySendgrid(headers: Headers, rawBody: string, publicKeyPem: string): boolean {
  const sig = headers.get("x-twilio-email-event-webhook-signature");
  const ts = headers.get("x-twilio-email-event-webhook-timestamp");
  if (!sig || !ts) return false;
  try {
    const pem = publicKeyPem.includes("BEGIN PUBLIC KEY")
      ? publicKeyPem
      : `-----BEGIN PUBLIC KEY-----\n${publicKeyPem.replace(/\s+/g, "")}\n-----END PUBLIC KEY-----\n`;
    const v = createVerify("SHA256");
    v.update(ts + rawBody);
    v.end();
    return v.verify(pem, sig, "base64");
  } catch {
    return false;
  }
}

// Postmark: Basic Auth on the URL. We accept `Authorization: Bearer <secret>` OR
// a matching `x-postmark-webhook-secret` header for simplicity.
function verifyPostmark(headers: Headers, secret: string): boolean {
  const bearer = headers.get("authorization");
  if (bearer && bearer.toLowerCase().startsWith("bearer ") && bufEq(bearer.slice(7).trim(), secret)) {
    return true;
  }
  const custom = headers.get("x-postmark-webhook-secret");
  if (custom && bufEq(custom, secret)) return true;
  return false;
}

// Mailgun: HMAC-SHA256 over `${timestamp}${token}` with the signing key.
function verifyMailgun(body: any, secret: string): boolean {
  const sig = body?.signature;
  if (!sig?.timestamp || !sig?.token || !sig?.signature) return false;
  const expected = createHmac("sha256", secret)
    .update(String(sig.timestamp) + String(sig.token))
    .digest("hex");
  return bufEq(sig.signature, expected);
}

// ---------- provider event → normalized ----------

function normalize(provider: string, payload: any): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  const push = (e: Partial<NormalizedEvent>) => {
    out.push({
      provider,
      eventType: e.eventType ?? "unknown",
      status: e.status ?? "unknown",
      providerMessageId: e.providerMessageId ?? null,
      recipient: e.recipient ?? null,
      reason: e.reason ?? null,
      occurredAt: e.occurredAt ?? new Date().toISOString(),
      raw: e.raw ?? payload,
    });
  };

  if (provider === "resend") {
    const type = String(payload?.type ?? "").toLowerCase(); // email.delivered, email.bounced, email.complained, email.delivery_delayed, email.opened, email.clicked
    const data = payload?.data ?? {};
    const status: NormalizedEvent["status"] = type.endsWith("delivered")
      ? "delivered"
      : type.endsWith("bounced")
      ? "bounced"
      : type.endsWith("complained")
      ? "complained"
      : type.endsWith("delivery_delayed")
      ? "deferred"
      : type.endsWith("opened")
      ? "opened"
      : type.endsWith("clicked")
      ? "clicked"
      : "unknown";
    push({
      eventType: type,
      status,
      providerMessageId: data.email_id ?? data.id ?? null,
      recipient: Array.isArray(data.to) ? data.to[0] : data.to ?? null,
      reason: data.bounce?.message ?? data.reason ?? null,
      occurredAt: payload.created_at ?? undefined,
      raw: payload,
    });
    return out;
  }

  if (provider === "sendgrid") {
    // Array of events
    const arr = Array.isArray(payload) ? payload : [];
    for (const e of arr) {
      const ev = String(e.event ?? "").toLowerCase();
      const status: NormalizedEvent["status"] = ev === "delivered"
        ? "delivered"
        : ev === "bounce" || ev === "dropped"
        ? "bounced"
        : ev === "deferred"
        ? "deferred"
        : ev === "spamreport"
        ? "complained"
        : ev === "open"
        ? "opened"
        : ev === "click"
        ? "clicked"
        : "unknown";
      push({
        eventType: ev,
        status,
        providerMessageId: e.sg_message_id?.split(".")[0] ?? e["smtp-id"] ?? null,
        recipient: e.email ?? null,
        reason: e.reason ?? e.response ?? null,
        occurredAt: e.timestamp ? new Date(e.timestamp * 1000).toISOString() : undefined,
        raw: e,
      });
    }
    return out;
  }

  if (provider === "postmark") {
    const type = String(payload?.RecordType ?? "").toLowerCase();
    const status: NormalizedEvent["status"] = type === "delivery"
      ? "delivered"
      : type === "bounce"
      ? (String(payload?.Type ?? "").toLowerCase() === "softbounce" ? "deferred" : "bounced")
      : type === "spamcomplaint"
      ? "complained"
      : type === "open"
      ? "opened"
      : type === "click"
      ? "clicked"
      : "unknown";
    push({
      eventType: type,
      status,
      providerMessageId: payload.MessageID ?? null,
      recipient: payload.Recipient ?? payload.Email ?? null,
      reason: payload.Description ?? payload.Details ?? null,
      occurredAt: payload.DeliveredAt ?? payload.BouncedAt ?? payload.ReceivedAt ?? undefined,
      raw: payload,
    });
    return out;
  }

  if (provider === "mailgun") {
    const ev = payload?.["event-data"] ?? {};
    const type = String(ev.event ?? "").toLowerCase(); // delivered, failed, complained, opened, clicked
    const severity = String(ev.severity ?? "").toLowerCase();
    const status: NormalizedEvent["status"] = type === "delivered"
      ? "delivered"
      : type === "failed"
      ? (severity === "temporary" ? "deferred" : "bounced")
      : type === "complained"
      ? "complained"
      : type === "opened"
      ? "opened"
      : type === "clicked"
      ? "clicked"
      : "unknown";
    push({
      eventType: type,
      status,
      providerMessageId: ev.message?.headers?.["message-id"] ?? null,
      recipient: ev.recipient ?? null,
      reason: ev["delivery-status"]?.description ?? ev.reason ?? null,
      occurredAt: ev.timestamp ? new Date(ev.timestamp * 1000).toISOString() : undefined,
      raw: payload,
    });
    return out;
  }

  return out;
}

// ---------- persistence ----------

async function applyEvent(evt: NormalizedEvent, signatureValid: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // Match by provider message id
  let matchedQueueId: string | null = null;
  let matchedFeedbackId: string | null = null;
  if (evt.providerMessageId) {
    const { data: q } = await supabaseAdmin
      .from("email_queue")
      .select("id, feedback_id, kind")
      .eq("provider_message_id", evt.providerMessageId)
      .maybeSingle();
    if (q) {
      matchedQueueId = q.id;
      matchedFeedbackId = q.feedback_id;

      if (signatureValid) {
        const now = evt.occurredAt;
        const patch: any = {
          last_event_at: now,
          provider_status: evt.status,
        };
        if (evt.status === "delivered") patch.delivered_at = now;
        if (evt.status === "bounced") {
          patch.bounced_at = now;
          patch.bounce_reason = evt.reason;
          patch.status = "failed";
          patch.last_error = evt.reason ?? "Bounced";
        }
        if (evt.status === "complained") {
          patch.complained_at = now;
          patch.complaint_reason = evt.reason;
        }
        if (evt.status === "deferred") {
          patch.deferred_until = now;
          patch.defer_reason = evt.reason;
        }
        await supabaseAdmin.from("email_queue").update(patch).eq("id", matchedQueueId);

        if (matchedFeedbackId) {
          const fbPatch: any = {};
          if (evt.status === "delivered") fbPatch.delivered_at = now;
          if (evt.status === "bounced") fbPatch.email_error = evt.reason ?? "Bounced";
          if (Object.keys(fbPatch).length) {
            await supabaseAdmin.from("feedback").update(fbPatch).eq("id", matchedFeedbackId);
          }

          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: matchedFeedbackId,
            event_type: evt.status,
            detail: {
              provider: evt.provider,
              providerEvent: evt.eventType,
              reason: evt.reason,
              recipient: evt.recipient,
              providerMessageId: evt.providerMessageId,
            },
          });
        }
      }
    }
  }

  await supabaseAdmin.from("email_webhook_events").insert({
    provider: evt.provider,
    event_type: evt.eventType,
    provider_message_id: evt.providerMessageId,
    recipient: evt.recipient,
    signature_valid: signatureValid,
    matched_queue_id: matchedQueueId,
    matched_feedback_id: matchedFeedbackId,
    payload: evt.raw as any,
    error: signatureValid ? null : "signature_invalid",
  });
}

// ---------- route ----------

export const Route = createFileRoute("/api/public/webhooks/email/$provider")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const provider = String(params.provider ?? "").toLowerCase();
        const validProviders = ["resend", "sendgrid", "postmark", "mailgun"];
        if (!validProviders.includes(provider)) {
          return Response.json({ error: "unknown_provider" }, { status: 404 });
        }

        const rawBody = await request.text();
        let payload: any = null;
        try {
          payload = rawBody ? JSON.parse(rawBody) : {};
        } catch {
          return Response.json({ error: "invalid_json" }, { status: 400 });
        }

        const secretEnv: Record<string, string | undefined> = {
          resend: process.env.EMAIL_WEBHOOK_SECRET_RESEND,
          sendgrid: process.env.EMAIL_WEBHOOK_SECRET_SENDGRID,
          postmark: process.env.EMAIL_WEBHOOK_SECRET_POSTMARK,
          mailgun: process.env.EMAIL_WEBHOOK_SECRET_MAILGUN,
        };
        const secret = secretEnv[provider];
        if (!secret) {
          return Response.json(
            { error: "webhook_secret_not_configured", hint: `Set EMAIL_WEBHOOK_SECRET_${provider.toUpperCase()}` },
            { status: 503 },
          );
        }

        let signatureValid = false;
        try {
          signatureValid =
            provider === "resend"
              ? verifyResend(request.headers, rawBody, secret)
              : provider === "sendgrid"
              ? verifySendgrid(request.headers, rawBody, secret)
              : provider === "postmark"
              ? verifyPostmark(request.headers, secret)
              : provider === "mailgun"
              ? verifyMailgun(payload, secret)
              : false;
        } catch {
          signatureValid = false;
        }

        if (!signatureValid) {
          // Log for observability, then reject.
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          await supabaseAdmin.from("email_webhook_events").insert({
            provider,
            event_type: "signature_invalid",
            payload: payload as any,
            signature_valid: false,
            error: "signature_invalid",
          });
          return new Response("Invalid signature", { status: 401 });
        }

        const events = normalize(provider, payload);
        for (const evt of events) {
          await applyEvent(evt, true);
        }

        return Response.json({ ok: true, processed: events.length });
      },
    },
  },
});
