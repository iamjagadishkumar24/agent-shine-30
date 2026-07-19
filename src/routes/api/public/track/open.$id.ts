import { createFileRoute } from "@tanstack/react-router";

// 1x1 transparent GIF
const PIXEL = Uint8Array.from([
  71, 73, 70, 56, 57, 97, 1, 0, 1, 0, 128, 0, 0, 0, 0, 0, 255, 255, 255, 33, 249, 4, 1, 0, 0, 0, 0,
  44, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 68, 1, 0, 59,
]);

export const Route = createFileRoute("/api/public/track/open/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const nowIso = new Date().toISOString();
          const { data: fb } = await supabaseAdmin
            .from("feedback")
            .select("id, first_opened_at, open_count")
            .eq("id", params.id)
            .maybeSingle();
          if (fb) {
            const isFirstOpen = !fb.first_opened_at;
            await supabaseAdmin
              .from("feedback")
              .update({
                opened_at: nowIso,
                first_opened_at: fb.first_opened_at ?? nowIso,
                open_count: (fb.open_count ?? 0) + 1,
              })
              .eq("id", params.id);
            await supabaseAdmin.from("feedback_email_events").insert({
              feedback_id: params.id,
              event_type: "opened",
              detail: { first_open: isFirstOpen, open_count: (fb.open_count ?? 0) + 1 },
            });
            if (isFirstOpen) {
              await supabaseAdmin.from("feedback_audit_log").insert({
                feedback_id: params.id,
                actor_id: null,
                action: "email_opened",
                comment: "Recipient opened the email",
                metadata: { source: "open_pixel" },
              });
            }
          }
        } catch (e) {
          console.error("open pixel error", e);
        }
        return new Response(PIXEL, {
          status: 200,
          headers: {
            "Content-Type": "image/gif",
            "Cache-Control": "no-store, no-cache, must-revalidate, private",
            "Content-Length": String(PIXEL.byteLength),
          },
        });
      },
    },
  },
});
