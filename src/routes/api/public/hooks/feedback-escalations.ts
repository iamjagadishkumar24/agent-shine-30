import { createFileRoute } from "@tanstack/react-router";

// Acknowledgement reminder emails to agents have been disabled by product decision.
// The pg_cron schedule has been removed; this endpoint is a no-op but records an
// audit log entry every time it is called so we can observe stray invocations.
export const Route = createFileRoute("/api/public/hooks/feedback-escalations")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const ip =
          request.headers.get("cf-connecting-ip") ||
          request.headers.get("x-forwarded-for") ||
          null;
        const userAgent = request.headers.get("user-agent") || null;
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected =
          process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        const authenticated = Boolean(expected) && apiKey === expected;

        await supabaseAdmin.from("access_audit_logs").insert({
          action: "feedback_escalations.invoked_while_disabled",
          ip_address: ip,
          user_agent: userAgent,
          new_value: {
            authenticated,
            disabled: true,
            called_at: new Date().toISOString(),
          },
        });

        return Response.json({ processed: 0, disabled: true });
      },
    },
  },
});
