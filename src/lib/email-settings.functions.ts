import { createServerFn } from "@tanstack/react-start";
import { getRequestHost } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  renderCustomTemplate,
  sampleVariableMap,
} from "./feedback-email.variables";
import { renderFeedbackEmail } from "./feedback-email.templates";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";

function getAppBaseUrl(): string {
  const envUrl = process.env.APP_BASE_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");
  try {
    const host = getRequestHost();
    if (host) return `https://${host}`;
  } catch {}
  return "https://app.example.com";
}

const SettingsInput = z.object({
  provider: z.string().trim().min(1).max(50),
  sender_name: z.string().trim().min(1).max(120),
  sender_email: z.string().trim().email().max(255),
  reply_to: z.string().trim().email().max(255).or(z.literal("")).optional().nullable(),
  signature_html: z.string().max(20000).optional().nullable(),
  logo_url: z.string().trim().url().max(2048).or(z.literal("")).optional().nullable(),
  confidentiality_notice: z.string().max(2000).optional().nullable(),
  enabled: z.boolean(),
  dev_override_enabled: z.boolean().optional(),
  dev_override_recipient: z
    .string()
    .trim()
    .email()
    .max(255)
    .or(z.literal(""))
    .optional()
    .nullable(),
});


async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const [{ data: isQaAdmin, error: e1 }, { data: isSuperAdmin, error: e2 }] = await Promise.all([
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" }),
    ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" }),
  ]);
  if (e1 || e2) {
    console.error("[email-settings] role lookup failed", e1 ?? e2);
    throw new Response("Unable to verify permissions", { status: 500 });
  }
  if (!isQaAdmin && !isSuperAdmin) {
    throw new Response("Admin role required", { status: 403 });
  }
}

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => {
    switch (ch) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      default: return "&#39;";
    }
  });
}

function sanitizeHeader(input: string): string {
  // Strip CR/LF to defeat header-injection through subject/sender name.
  return input.replace(/[\r\n]+/g, " ").trim().slice(0, 200);
}

export const getEmailSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.error("[email-settings] load failed", error);
      throw new Response("Unable to load email settings", { status: 500 });
    }
    return data;
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch = {
      ...data,
      sender_name: sanitizeHeader(data.sender_name),
      reply_to: data.reply_to ? data.reply_to : null,
      logo_url: data.logo_url ? data.logo_url : null,
      dev_override_enabled: !!data.dev_override_enabled,
      dev_override_recipient: data.dev_override_recipient ? data.dev_override_recipient : null,
      updated_by: context.userId,
    };

    const { data: row, error } = await context.supabase
      .from("email_settings")
      .update(patch)
      .eq("singleton", true)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[email-settings] save failed", error);
      throw new Response("Unable to save email settings", { status: 500 });
    }
    if (!row) throw new Response("Email settings row missing", { status: 404 });
    return row;
  });

export const verifyEmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const started = Date.now();
    const { data: s, error } = await context.supabase
      .from("email_settings")
      .select("provider")
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.error("[email-settings] provider lookup failed", error);
      throw new Response("Unable to load provider", { status: 500 });
    }
    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s?.provider ?? "gmail");
    try {
      const result = await provider.verify();
      return { ...result, provider: provider.displayName, latencyMs: Date.now() - started };
    } catch (err) {
      console.error("[email-settings] verify failed", err);
      return {
        ok: false,
        message: err instanceof Error ? err.message.slice(0, 300) : "Verification failed",
        provider: provider.displayName,
        latencyMs: Date.now() - started,
      };
    }
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string }) =>
    z.object({ to: z.string().trim().email().max(255) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: s, error } = await context.supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.error("[email-settings] settings lookup failed", error);
      throw new Response("Unable to load settings", { status: 500 });
    }
    if (!s || !s.sender_email) {
      throw new Response("Configure sender email in Settings first", { status: 400 });
    }
    if (!s.enabled) {
      throw new Response("Email service is disabled", { status: 400 });
    }
    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s.provider);
    const senderName = sanitizeHeader(s.sender_name ?? "");
    const timestamp = new Date().toISOString();
    const started = Date.now();
    try {
      const res = await provider.send({
        from: { name: senderName, email: s.sender_email },
        to: data.to,
        replyTo: s.reply_to,
        subject: sanitizeHeader(`Test email from ${senderName}`),
        text: `This is a test message from your QA platform.\nProvider: ${provider.displayName}\nSent: ${timestamp}`,
        html: `<!doctype html><body style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px;">
          <h2 style="margin:0 0 12px;font-size:18px;">Test email delivered</h2>
          <p style="color:#3f3f46;">Your QA platform sent this test message using <strong>${escapeHtml(provider.displayName)}</strong>.</p>
          <p style="color:#71717a;font-size:12px;">Timestamp: ${escapeHtml(timestamp)}</p>
        </body>`,
      });
      return { ...res, latencyMs: Date.now() - started };
    } catch (err) {
      console.error("[email-settings] test send failed", err);
      throw new Response(
        err instanceof Error ? err.message.slice(0, 300) : "Test email failed",
        { status: 502 },
      );
    }
  });

// ---------------------------------------------------------------------------
// Feedback email template editor
// ---------------------------------------------------------------------------

const TemplateInput = z.object({
  feedback_template_subject: z.string().trim().min(1).max(300),
  feedback_template_html: z.string().min(1).max(200_000),
  feedback_template_text: z.string().max(50_000).optional().nullable(),
  feedback_template_enabled: z.boolean(),
});

export const saveFeedbackTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplateInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: row, error } = await context.supabase
      .from("email_settings")
      .update({
        feedback_template_subject: sanitizeHeader(data.feedback_template_subject),
        feedback_template_html: data.feedback_template_html,
        feedback_template_text: data.feedback_template_text ?? null,
        feedback_template_enabled: data.feedback_template_enabled,
        updated_by: context.userId,
      })
      .eq("singleton", true)
      .select("*")
      .maybeSingle();
    if (error) {
      console.error("[email-settings] template save failed", error);
      throw new Response("Unable to save template", { status: 500 });
    }
    if (!row) throw new Response("Email settings row missing", { status: 404 });
    return row;
  });

const PreviewInput = z.object({
  subject: z.string().max(300),
  html: z.string().max(200_000),
  text: z.string().max(50_000).optional().nullable(),
  overrides: z.record(z.string(), z.string()).optional(),
});

export const previewFeedbackTemplate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => PreviewInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const vars = { ...sampleVariableMap(), ...(data.overrides ?? {}) };
    return renderCustomTemplate(
      { subject: data.subject, html: data.html, text: data.text ?? "" },
      vars,
    );
  });

const TemplateTestInput = z.object({
  to: z.string().trim().email().max(255),
  subject: z.string().min(1).max(300),
  html: z.string().min(1).max(200_000),
  text: z.string().max(50_000).optional().nullable(),
  overrides: z.record(z.string(), z.string()).optional(),
  scheduledAt: z.string().datetime().optional().nullable(),
});

export const sendFeedbackTemplateTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => TemplateTestInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);

    const { data: s, error } = await context.supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.error("[email-settings] settings lookup failed", error);
      throw new Response("Unable to load settings", { status: 500 });
    }
    if (!s || !s.sender_email) throw new Response("Configure sender email first", { status: 400 });
    if (!s.enabled) throw new Response("Email service is disabled", { status: 400 });

    const vars = { ...sampleVariableMap(), ...(data.overrides ?? {}) };
    // Ensure branding values reflect the actual account.
    vars.senderName = s.sender_name ?? vars.senderName;
    const rendered = renderCustomTemplate(
      { subject: data.subject, html: data.html, text: data.text ?? "" },
      vars,
    );
    const subject = sanitizeHeader(`[TEST] ${rendered.subject}`);

    // Scheduled path: enqueue with a future next_attempt_at so the drainer
    // picks it up when due. Rejects timestamps in the past or > 30 days out.
    if (data.scheduledAt) {
      const at = new Date(data.scheduledAt);
      const now = Date.now();
      const max = now + 30 * 24 * 60 * 60 * 1000;
      if (isNaN(at.getTime())) throw new Response("Invalid schedule time", { status: 400 });
      if (at.getTime() < now - 60_000) throw new Response("Schedule time is in the past", { status: 400 });
      if (at.getTime() > max) throw new Response("Schedule time must be within 30 days", { status: 400 });

      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: job, error: qErr } = await supabaseAdmin
        .from("email_queue")
        .insert({
          feedback_id: null,
          kind: "test",
          to_email: data.to,
          to_name: null,
          subject,
          html: rendered.html,
          text_body: rendered.text,
          attachments: [],
          priority: 5,
          status: "queued",
          max_attempts: 3,
          next_attempt_at: at.toISOString(),
          created_by: context.userId,
        })
        .select("id, next_attempt_at")
        .single();
      if (qErr || !job) {
        console.error("[email-settings] template test schedule failed", qErr);
        throw new Response("Unable to schedule test email", { status: 500 });
      }
      return { ok: true as const, scheduled: true, queueId: job.id, nextAttemptAt: job.next_attempt_at };
    }

    // Immediate send via provider.
    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s.provider);
    const started = Date.now();
    try {
      const res = await provider.send({
        from: { name: sanitizeHeader(s.sender_name ?? ""), email: s.sender_email },
        to: data.to,
        replyTo: s.reply_to,
        subject,
        html: rendered.html,
        text: rendered.text,
      });
      return { ...res, scheduled: false as const, latencyMs: Date.now() - started };
    } catch (err) {
      console.error("[email-settings] template test send failed", err);
      throw new Response(
        err instanceof Error ? err.message.slice(0, 300) : "Test email failed",
        { status: 502 },
      );
    }
  });

// Expose the current variable-map derivation for demo use (unused server-side; kept
// as an intentional touch so `buildVariableMap` stays imported alongside the sample map).

// ---------------------------------------------------------------------------
// Branding test: sends the Zenwork feedback template with sample data and
// the currently configured logo so admins can visually verify branding.
// ---------------------------------------------------------------------------

export const sendBrandingTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string }) =>
    z.object({ to: z.string().trim().email().max(255) }).parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: s, error } = await context.supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (error) {
      console.error("[email-settings] settings lookup failed", error);
      throw new Response("Unable to load settings", { status: 500 });
    }
    if (!s || !s.sender_email) throw new Response("Configure sender email first", { status: 400 });
    if (!s.enabled) throw new Response("Email service is disabled", { status: 400 });

    const appBaseUrl = getAppBaseUrl();
    const rendered = renderFeedbackEmail({
      feedbackId: "SAMPLE-0001",
      title: "Sample feedback — branding preview",
      agentName: "Jordan Rivers",
      managerName: s.sender_name ?? "Customer Success Team",
      category: "Communication",
      feedbackType: "coaching",
      severity: "medium",
      score: 92,
      summary:
        "This is a branding preview generated from your current template and logo. Real feedback emails will use the same layout with live data.",
      strengths:
        "Clear, empathetic tone across the interaction\nAccurate resolution on the first contact",
      improvements:
        "Slow initial response — aim to acknowledge within 30 seconds",
      recommendedActions:
        "Review greeting script in the QA library\nShadow a top-performing peer this week",
      dueDate: new Date(Date.now() + 7 * 86400_000).toISOString(),
      appBaseUrl,
      senderName: s.sender_name,
      logoUrl: s.logo_url ?? `${appBaseUrl}${zenworkLogo.url}`,
      signatureHtml: s.signature_html,
      confidentialityNotice: s.confidentiality_notice,
      attachmentLinks: [],
    });

    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s.provider);
    const started = Date.now();
    try {
      const res = await provider.send({
        from: { name: sanitizeHeader(s.sender_name ?? ""), email: s.sender_email },
        to: data.to,
        replyTo: s.reply_to,
        subject: sanitizeHeader(`[TEST] ${rendered.subject}`),
        html: rendered.html,
        text: rendered.text,
      });
      return { ...res, latencyMs: Date.now() - started };
    } catch (err) {
      console.error("[email-settings] branding test failed", err);
      throw new Response(
        err instanceof Error ? err.message.slice(0, 300) : "Branding test failed",
        { status: 502 },
      );
    }
  });
