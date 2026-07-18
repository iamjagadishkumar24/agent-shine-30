import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const SettingsInput = z.object({
  provider: z.string().min(1).max(50),
  sender_name: z.string().trim().min(1).max(120),
  sender_email: z.string().trim().email(),
  reply_to: z.string().trim().email().or(z.literal("")).optional().nullable(),
  signature_html: z.string().max(20000).optional().nullable(),
  logo_url: z.string().trim().url().or(z.literal("")).optional().nullable(),
  confidentiality_notice: z.string().max(2000).optional().nullable(),
  enabled: z.boolean(),
});

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data, error } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "qa_admin" });
  if (error) throw new Error(error.message);
  if (!data) {
    const { data: sa } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "super_admin" });
    if (!sa) throw new Error("Forbidden: admin required");
  }
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
    if (error) throw new Error(error.message);
    return data;
  });

export const saveEmailSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => SettingsInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const patch = {
      ...data,
      reply_to: data.reply_to || null,
      logo_url: data.logo_url || null,
      updated_by: context.userId,
    };
    const { data: row, error } = await context.supabase
      .from("email_settings")
      .update(patch)
      .eq("singleton", true)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });

export const verifyEmailConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const started = Date.now();
    const { data: s } = await context.supabase
      .from("email_settings")
      .select("provider")
      .eq("singleton", true)
      .maybeSingle();
    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s?.provider ?? "gmail");
    const result = await provider.verify();
    return { ...result, provider: provider.displayName, latencyMs: Date.now() - started };
  });

export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { to: string }) => z.object({ to: z.string().trim().email() }).parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: s } = await context.supabase
      .from("email_settings")
      .select("*")
      .eq("singleton", true)
      .maybeSingle();
    if (!s || !s.sender_email) throw new Error("Configure sender email in Settings first");
    if (!s.enabled) throw new Error("Email service is disabled");
    const { getProvider } = await import("@/lib/email/providers.server");
    const provider = getProvider(s.provider);
    const started = Date.now();
    const res = await provider.send({
      from: { name: s.sender_name, email: s.sender_email },
      to: data.to,
      replyTo: s.reply_to,
      subject: `Test email from ${s.sender_name}`,
      text: `This is a test message from your QA platform.\nProvider: ${provider.displayName}\nSent: ${new Date().toISOString()}`,
      html: `<!doctype html><body style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;padding:24px;">
        <h2 style="margin:0 0 12px;font-size:18px;">Test email delivered</h2>
        <p style="color:#3f3f46;">Your QA platform sent this test message using <strong>${provider.displayName}</strong>.</p>
        <p style="color:#71717a;font-size:12px;">Timestamp: ${new Date().toISOString()}</p>
      </body>`,
    });
    return { ...res, latencyMs: Date.now() - started };
  });
