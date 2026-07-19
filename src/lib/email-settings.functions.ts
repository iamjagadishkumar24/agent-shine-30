import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import {
  buildVariableMap,
  renderCustomTemplate,
  sampleVariableMap,
} from "./feedback-email.variables";

const SettingsInput = z.object({
  provider: z.string().trim().min(1).max(50),
  sender_name: z.string().trim().min(1).max(120),
  sender_email: z.string().trim().email().max(255),
  reply_to: z.string().trim().email().max(255).or(z.literal("")).optional().nullable(),
  signature_html: z.string().max(20000).optional().nullable(),
  logo_url: z.string().trim().url().max(2048).or(z.literal("")).optional().nullable(),
  confidentiality_notice: z.string().max(2000).optional().nullable(),
  enabled: z.boolean(),
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
