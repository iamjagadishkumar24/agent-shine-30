import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type CheckStatus = "ok" | "warn" | "fail";
export type HealthCheck = {
  id: string;
  module: string;
  name: string;
  status: CheckStatus;
  message: string;
  latencyMs?: number;
  detail?: Record<string, unknown>;
};

async function timed<T>(fn: () => Promise<T>): Promise<{ result: T; latencyMs: number }> {
  const t = Date.now();
  const result = await fn();
  return { result, latencyMs: Date.now() - t };
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const roles = ["qa_admin", "super_admin"];
  for (const r of roles) {
    const { data } = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: r });
    if (data) return;
  }
  throw new Error("Forbidden: admin required");
}

export const runHealthChecks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const checks: HealthCheck[] = [];
    const { supabase, userId } = context;

    // --- Auth ---
    try {
      const { result, latencyMs } = await timed(() => supabase.auth.getUser());
      const ok = !!result.data?.user && !result.error;
      checks.push({
        id: "auth.session",
        module: "Auth",
        name: "Current session",
        status: ok ? "ok" : "fail",
        message: ok ? `Signed in as ${result.data.user!.email}` : result.error?.message ?? "No user",
        latencyMs,
      });
    } catch (e) {
      checks.push({ id: "auth.session", module: "Auth", name: "Current session", status: "fail", message: (e as Error).message });
    }

    // --- Database connectivity + core tables ---
    const tables = ["profiles", "agents", "feedback", "user_roles", "notifications", "coaching_sessions"] as const;
    for (const t of tables) {
      try {
        const { result, latencyMs } = await timed(() =>
          supabase.from(t).select("*", { count: "exact", head: true }),
        );
        const err = (result as any).error;
        checks.push({
          id: `db.${t}`,
          module: "Database",
          name: `Table: ${t}`,
          status: err ? "fail" : "ok",
          message: err ? err.message : `${(result as any).count ?? 0} rows readable`,
          latencyMs,
        });
      } catch (e) {
        checks.push({ id: `db.${t}`, module: "Database", name: `Table: ${t}`, status: "fail", message: (e as Error).message });
      }
    }

    // --- has_role RPC ---
    try {
      const { result, latencyMs } = await timed(() =>
        supabase.rpc("has_role", { _user_id: userId, _role: "qa_admin" }),
      );
      const err = (result as any).error;
      checks.push({
        id: "db.has_role",
        module: "Database",
        name: "RPC: has_role",
        status: err ? "fail" : "ok",
        message: err ? err.message : `Callable (returned ${String((result as any).data)})`,
        latencyMs,
      });
    } catch (e) {
      checks.push({ id: "db.has_role", module: "Database", name: "RPC: has_role", status: "fail", message: (e as Error).message });
    }

    // --- Storage buckets ---
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { result, latencyMs } = await timed(() => supabaseAdmin.storage.listBuckets());
      const err = (result as any).error;
      const names = ((result as any).data ?? []).map((b: any) => b.name);
      const need = ["feedback-attachments", "avatars"];
      const missing = need.filter((n) => !names.includes(n));
      checks.push({
        id: "storage.buckets",
        module: "Storage",
        name: "Buckets present",
        status: err ? "fail" : missing.length ? "warn" : "ok",
        message: err ? err.message : missing.length ? `Missing: ${missing.join(", ")}` : `Found: ${names.join(", ")}`,
        latencyMs,
      });
    } catch (e) {
      checks.push({ id: "storage.buckets", module: "Storage", name: "Buckets present", status: "fail", message: (e as Error).message });
    }

    // --- Email settings + provider verify ---
    let emailSettings: any = null;
    try {
      const { data, error } = await supabase.from("email_settings").select("*").eq("singleton", true).maybeSingle();
      if (error) throw error;
      emailSettings = data;
      checks.push({
        id: "email.settings",
        module: "Email",
        name: "Settings configured",
        status: data?.sender_email ? "ok" : "warn",
        message: data?.sender_email
          ? `Sender: ${data.sender_name} <${data.sender_email}> · Provider: ${data.provider} · ${data.enabled ? "Enabled" : "Disabled"}`
          : "No sender configured",
      });
    } catch (e) {
      checks.push({ id: "email.settings", module: "Email", name: "Settings configured", status: "fail", message: (e as Error).message });
    }

    try {
      const { getProvider } = await import("@/lib/email/providers.server");
      const provider = getProvider(emailSettings?.provider ?? "gmail");
      const { result, latencyMs } = await timed(() => provider.verify());
      checks.push({
        id: "email.provider",
        module: "Email",
        name: `Provider: ${provider.displayName}`,
        status: result.ok ? (emailSettings?.enabled ? "ok" : "warn") : "fail",
        message: result.ok
          ? `Connected${(result as any).account ? ` as ${(result as any).account}` : ""}${!emailSettings?.enabled ? " (service disabled)" : ""}`
          : (result as any).error,
        latencyMs,
      });
    } catch (e) {
      checks.push({ id: "email.provider", module: "Email", name: "Provider connection", status: "fail", message: (e as Error).message });
    }

    // --- Email queue health ---
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const [{ count: queued }, { count: failed }, { count: sent }] = await Promise.all([
        supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "queued"),
        supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "failed"),
        supabaseAdmin.from("email_queue").select("*", { count: "exact", head: true }).eq("status", "sent"),
      ]);
      checks.push({
        id: "email.queue",
        module: "Email",
        name: "Delivery queue",
        status: (failed ?? 0) > 5 ? "warn" : "ok",
        message: `queued: ${queued ?? 0} · sent: ${sent ?? 0} · failed: ${failed ?? 0}`,
      });
    } catch (e) {
      checks.push({ id: "email.queue", module: "Email", name: "Delivery queue", status: "warn", message: (e as Error).message });
    }

    // --- AI Gateway ---
    try {
      const hasKey = !!process.env.LOVABLE_API_KEY;
      if (!hasKey) {
        checks.push({ id: "ai.gateway", module: "AI", name: "Lovable AI Gateway", status: "fail", message: "LOVABLE_API_KEY not set" });
      } else {
        const { result, latencyMs } = await timed(() =>
          fetch("https://ai.gateway.lovable.dev/v1/models", {
            headers: { "Lovable-API-Key": process.env.LOVABLE_API_KEY! },
          }),
        );
        checks.push({
          id: "ai.gateway",
          module: "AI",
          name: "Lovable AI Gateway",
          status: result.ok ? "ok" : "fail",
          message: result.ok ? `Reachable (HTTP ${result.status})` : `HTTP ${result.status}`,
          latencyMs,
        });
      }
    } catch (e) {
      checks.push({ id: "ai.gateway", module: "AI", name: "Lovable AI Gateway", status: "fail", message: (e as Error).message });
    }

    // --- Environment vars ---
    const envs = ["SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SERVICE_ROLE_KEY", "LOVABLE_API_KEY"] as const;
    for (const v of envs) {
      const present = !!process.env[v];
      checks.push({
        id: `env.${v}`,
        module: "Environment",
        name: v,
        status: present ? "ok" : "fail",
        message: present ? "Configured" : "Missing",
      });
    }

    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
      total: checks.length,
    };
    return { checks, summary, generatedAt: new Date().toISOString() };
  });
