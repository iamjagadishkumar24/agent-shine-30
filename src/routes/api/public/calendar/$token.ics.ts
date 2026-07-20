import { createFileRoute } from "@tanstack/react-router";
import { buildIcs, type CalendarEvent } from "@/lib/calendar-links";

// Per-user subscription feed. Consumer pastes this URL into Outlook / Google / Apple
// as a "subscribed calendar" and their coaching sessions stay in sync.
// Auth model: opaque per-user token (see calendar_feed_tokens). Never accepts anon.
export const Route = createFileRoute("/api/public/calendar/$token/ics")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = String(params.token ?? "").replace(/\.ics$/i, "");
        if (!token || token.length < 20) return new Response("Not found", { status: 404 });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: row, error: tokErr } = await supabaseAdmin
          .from("calendar_feed_tokens")
          .select("user_id")
          .eq("token", token)
          .maybeSingle();
        if (tokErr || !row) return new Response("Not found", { status: 404 });

        // Best-effort last-used stamp
        await supabaseAdmin
          .from("calendar_feed_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("token", token);

        // Resolve every session where this user is coach OR the agent linked to them.
        const { data: agentRow } = await supabaseAdmin
          .from("agents")
          .select("id, full_name, email")
          .eq("user_id", row.user_id)
          .maybeSingle();

        const filters: string[] = [`coach_id.eq.${row.user_id}`];
        if (agentRow?.id) filters.push(`agent_id.eq.${agentRow.id}`);

        const { data: sessions, error: sErr } = await supabaseAdmin
          .from("coaching_sessions")
          .select("id, topic, scheduled_at, duration_minutes, meeting_link, meeting_location, agenda, notes, reminder_minutes, agent:agents!coaching_sessions_agent_id_fkey(full_name, email), status")
          .or(filters.join(","))
          .gte("scheduled_at", new Date(Date.now() - 30 * 86400_000).toISOString())
          .lte("scheduled_at", new Date(Date.now() + 365 * 86400_000).toISOString())
          .not("status", "in", '("canceled","cancelled")')
          .limit(500);

        if (sErr) return new Response("Feed error", { status: 500 });

        const events: CalendarEvent[] = (sessions ?? []).map((s: any) => {
          const start = new Date(s.scheduled_at);
          const end = new Date(start.getTime() + (s.duration_minutes ?? 30) * 60_000);
          const attendees: CalendarEvent["attendees"] = [];
          if (s.agent?.email) attendees.push({ email: s.agent.email, name: s.agent.full_name ?? undefined });
          const bodyParts = [
            s.agenda ? `Agenda:\n${s.agenda}` : "",
            s.notes ? `Notes:\n${s.notes}` : "",
            s.agent?.full_name ? `Agent: ${s.agent.full_name}` : "",
          ].filter(Boolean);
          return {
            uid: `${s.id}@qualipulse.coaching`,
            title: s.topic ?? "Coaching session",
            description: bodyParts.join("\n\n") || undefined,
            location: s.meeting_location ?? undefined,
            url: s.meeting_link ?? undefined,
            startISO: start.toISOString(),
            endISO: end.toISOString(),
            attendees,
            reminderMinutes: s.reminder_minutes ?? null,
          };
        });

        const ics = buildIcs(events, { method: "PUBLISH" });
        return new Response(ics, {
          status: 200,
          headers: {
            "Content-Type": "text/calendar; charset=utf-8",
            "Cache-Control": "no-cache, must-revalidate",
            "Content-Disposition": 'inline; filename="qualipulse-coaching.ics"',
          },
        });
      },
    },
  },
});
