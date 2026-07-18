import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/track/click/$id")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const url = new URL(request.url);
        const toParam = url.searchParams.get("to") || `/feedback/${params.id}`;
        // Only allow same-origin relative paths
        const safeTo = toParam.startsWith("/") && !toParam.startsWith("//") ? toParam : `/feedback/${params.id}`;
        const dest = `${url.origin}${safeTo}`;

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const nowIso = new Date().toISOString();
          const { data: fb } = await supabaseAdmin
            .from("feedback")
            .select("id, click_count")
            .eq("id", params.id)
            .maybeSingle();
          if (fb) {
            await supabaseAdmin
              .from("feedback")
              .update({
                clicked_at: nowIso,
                click_count: (fb.click_count ?? 0) + 1,
              })
              .eq("id", params.id);
            await supabaseAdmin.from("feedback_email_events").insert({
              feedback_id: params.id,
              event_type: "clicked",
              detail: { to: safeTo },
            });
          }
        } catch (e) {
          console.error("click tracker error", e);
        }
        return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
      },
    },
  },
});
