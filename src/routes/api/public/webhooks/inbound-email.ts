// Inbound email webhook.
//
// URL:  /api/public/webhooks/inbound-email
//
// Accepts JSON or form-encoded payloads from common inbound-parse providers
// (SendGrid Inbound Parse, Postmark Inbound, Mailgun Routes) and a simple
// generic JSON shape. Extracts the QualiPulse case number from the subject
// (pattern: QA-YYYY-NNNNNN), matches it to a feedback row, records the reply
// in feedback_email_responses, and flips acknowledgement_status to
// "response_received" while stamping agent_response_received_at.
//
// Auth: pass either
//   - Header "x-webhook-secret: <INBOUND_EMAIL_WEBHOOK_SECRET>" (preferred), or
//   - Header "apikey: <SUPABASE_PUBLISHABLE_KEY>"
//
// Configure the shared secret with the same value in the provider's inbound
// route settings.

import { createFileRoute } from "@tanstack/react-router";

const CASE_RE = /QA-\d{4}-\d{6}/i;

type ParsedReply = {
  caseNumber: string | null;
  from: string | null;
  to: string | null;
  subject: string;
  text: string;
  html: string | null;
  providerMessageId: string | null;
};

function pickCase(subject: string): string | null {
  const m = subject.match(CASE_RE);
  return m ? m[0].toUpperCase() : null;
}

function pickAddress(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  // Handle "Name <email@x>" and comma-separated lists — take first email.
  const angle = s.match(/<([^>]+)>/);
  if (angle) return angle[1].trim().toLowerCase();
  const first = s.split(",")[0]?.trim().toLowerCase() ?? null;
  return first && /@/.test(first) ? first : null;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v;
  }
  return null;
}

async function parsePayload(request: Request): Promise<ParsedReply | null> {
  const ct = request.headers.get("content-type") || "";
  let raw: Record<string, unknown> = {};

  if (ct.includes("application/json")) {
    raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  } else if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
    const form = await request.formData().catch(() => null);
    if (!form) return null;
    for (const [k, v] of form.entries()) raw[k] = typeof v === "string" ? v : v.name;
  } else {
    // Best-effort JSON fallback
    const txt = await request.text();
    try {
      raw = JSON.parse(txt);
    } catch {
      return null;
    }
  }

  // Normalize across providers. Field names come from SendGrid/Postmark/Mailgun/generic.
  const subject = firstString(raw.subject, raw.Subject, (raw as any).headers?.Subject) ?? "";
  const from = pickAddress(
    firstString(raw.from, raw.From, raw.sender, (raw as any).FromFull?.Email, (raw as any).envelope),
  );
  const to = pickAddress(firstString(raw.to, raw.To, (raw as any).recipient, (raw as any).ToFull?.[0]?.Email));
  const text =
    firstString(raw.text, raw.TextBody, (raw as any)["stripped-text"], (raw as any)["body-plain"]) ?? "";
  const html =
    firstString(raw.html, raw.HtmlBody, (raw as any)["stripped-html"], (raw as any)["body-html"]) ?? null;
  const providerMessageId =
    firstString(
      raw.messageId,
      raw.MessageID,
      (raw as any)["Message-Id"],
      (raw as any).message_id,
      (raw as any).headers?.["Message-Id"],
    ) ?? null;

  return {
    caseNumber: pickCase(subject) ?? pickCase(text) ?? null,
    from,
    to,
    subject,
    text,
    html,
    providerMessageId,
  };
}

function authorized(request: Request): boolean {
  const secret = process.env.INBOUND_EMAIL_WEBHOOK_SECRET;
  const apiKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  const givenSecret = request.headers.get("x-webhook-secret");
  const givenApi = request.headers.get("apikey") || request.headers.get("x-api-key");
  if (secret && givenSecret && givenSecret === secret) return true;
  if (apiKey && givenApi && givenApi === apiKey) return true;
  return false;
}

export const Route = createFileRoute("/api/public/webhooks/inbound-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!authorized(request)) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const parsed = await parsePayload(request);
        if (!parsed) {
          return new Response(JSON.stringify({ error: "unparseable payload" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!parsed.caseNumber) {
          // Store the orphaned reply for manual triage but don't fail the provider retry loop.
          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: null as any,
            event_type: "inbound_reply_unmatched",
            detail: {
              subject: parsed.subject,
              from: parsed.from,
              to: parsed.to,
              provider_message_id: parsed.providerMessageId,
            },
          });
          return Response.json({ matched: false, reason: "no case number in subject" });
        }

        const { data: fb, error: fbErr } = await supabaseAdmin
          .from("feedback")
          .select("id, case_number, acknowledgement_status")
          .eq("case_number", parsed.caseNumber)
          .maybeSingle();

        if (fbErr) {
          return new Response(JSON.stringify({ error: fbErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (!fb) {
          await supabaseAdmin.from("feedback_email_events").insert({
            feedback_id: null as any,
            event_type: "inbound_reply_unmatched",
            detail: {
              case_number: parsed.caseNumber,
              subject: parsed.subject,
              from: parsed.from,
              provider_message_id: parsed.providerMessageId,
            },
          });
          return Response.json({ matched: false, caseNumber: parsed.caseNumber });
        }

        const nowIso = new Date().toISOString();
        const messageBody = parsed.text || (parsed.html ?? "").replace(/<[^>]+>/g, " ").trim();

        const { error: insErr } = await supabaseAdmin.from("feedback_email_responses").insert({
          feedback_id: fb.id,
          case_number: parsed.caseNumber,
          sender_email: parsed.from,
          recipient_email: parsed.to,
          subject: parsed.subject,
          message_body: messageBody,
          provider_message_id: parsed.providerMessageId,
          received_at: nowIso,
        });
        if (insErr) {
          return new Response(JSON.stringify({ error: insErr.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }

        // Update feedback: mark response received. Only overwrite acknowledgement_status
        // if it hasn't already been explicitly acknowledged.
        const patch: any = {
          agent_response_received_at: nowIso,
        };
        if (fb.acknowledgement_status !== "acknowledged") {
          patch.acknowledgement_status = "response_received";
        }
        await supabaseAdmin.from("feedback").update(patch).eq("id", fb.id);

        await supabaseAdmin.from("feedback_email_events").insert({
          feedback_id: fb.id,
          event_type: "inbound_reply_received",
          detail: {
            case_number: parsed.caseNumber,
            from: parsed.from,
            provider_message_id: parsed.providerMessageId,
          },
        });

        return Response.json({
          matched: true,
          feedbackId: fb.id,
          caseNumber: parsed.caseNumber,
        });
      },
    },
  },
});
