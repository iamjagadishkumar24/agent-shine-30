
## Scope decisions

Three asks, each handled at the right depth:

1. **"QA" → "Customer Success"** — global rename in code copy, DB agent department, and email/report exports. Straightforward and I'll do it in full.
2. **Schedule Session "not working"** — quick investigation showed the save/update/delete/drag-drop paths are wired correctly (`SessionDialog` → `supabase.from("coaching_sessions").insert/update`, overlap trigger active, realtime invalidation subscribed). The DB has 0 sessions because none have been created yet, not because it's broken. I'll add a diagnostic path (surface the exact error text from the overlap trigger and RLS) and run an end-to-end smoke test to confirm it works from your seat. If a real bug shows up I fix it.
3. **Real calendar integration** — your own closing note is correct: a web app cannot drive desktop Outlook without a per-user OAuth integration. I'll ship the pragmatic universal path now and gate the full OAuth path behind an explicit follow-up.

## What I'll build

### A. QA → Customer Success rename
- **Copy sweep**: `agents.tsx` (`QA Score` column), `dashboard.tsx` (KPI + gauge labels), `analytics.tsx`, `feedback.$id.tsx`, `portal.$id.tsx`, `reports.tsx`, `feedback.new.tsx`, `settings.tsx` (default subject + signature placeholder), `heavy-charts.tsx`, `analytics-charts.tsx`, `command-palette.tsx` keywords, `account.tsx` placeholder, marketing (`index.tsx`, `auth.tsx` copy), AI prompt (`ai-feedback.functions.ts`), template variables (`feedback-email.variables.ts`), reports server (`reports.server.ts`), email test template (`email-settings.functions.ts` sample recommendations).
- **DB**: `UPDATE public.agents SET department = 'Customer Success' WHERE department = 'QA'`.
- **Preserve column name** `qa_score` (schema stability) but label it "Quality Score" everywhere in the UI/exports.

### B. Schedule Session hardening + smoke test
- Improve error surfacing in `SessionDialog.save.onError` so trigger errors (overlap, RLS) show the real reason.
- Ensure the "Schedule Session" entry point on `/coaching` and the "New session" quick action are both wired to open the dialog with sensible defaults.
- Live smoke test via Playwright against `/coaching`: create → edit → drag-drop reschedule → cancel → verify realtime propagation to dashboard.

### C. "Add to calendar" export menu (universal, no OAuth)
When a session is saved (and from a menu on every session card), offer:
- **Outlook Web** — deep link to `outlook.office.com/calendar/0/deeplink/compose` with subject/body/start/end/location.
- **Outlook.com (consumer)** — deep link to `outlook.live.com/calendar/0/deeplink/compose`.
- **Google Calendar** — deep link to `calendar.google.com/calendar/render?action=TEMPLATE&...`.
- **Download .ics** — RFC-5545 file, works with desktop Outlook, Apple Calendar, and every other client. Set `METHOD:REQUEST` with `ATTENDEE` lines so it acts as an invite.
- **Copy iCal feed URL** — per-user signed feed URL (see D below).

Component: `src/components/coaching/add-to-calendar-menu.tsx`. Wires from `SessionDialog` after save and from each session card's kebab menu.

### D. Personal iCal subscription feed
- New public route: `src/routes/api/public/calendar/$token.ics.ts` — returns all upcoming sessions for the agent/coach behind the token.
- New table `calendar_feed_tokens (user_id, token, created_at)` with per-user token minting from `/account`.
- Users paste the URL into Outlook/Google/Apple as a subscribed calendar; it stays synced without OAuth.

### E. Notifications
Already wired in DB triggers (`tg_coaching_session_notifications`) — I'll verify the create/reschedule/cancel branches fire and hook the "reminder due" email to the existing `pg_cron` dispatcher.

## What I'm NOT doing (needs your explicit go-ahead)

- **Google Calendar App User Connector** (per-user OAuth for direct event create/update via Google API). Requires you to create a Google OAuth client in Google Cloud Console and link it via App User Connectors. If you want this, say so and I'll walk you through the client setup.
- **Microsoft Graph App User Connector** (same story for Outlook 365 / Exchange).
- **Recurring meetings / Google Meet auto-generation** — these depend on the OAuth path above.
- **Desktop Outlook auto-open** — impossible from a web app; .ics is the correct substitute.

## Order of execution

1. DB migration (`agents.department = 'Customer Success'`, new `calendar_feed_tokens` table) — one migration, needs your approval.
2. QA→Customer Success code sweep.
3. Session dialog error-surfacing + smoke test.
4. `.ics` generator + deep-link menu.
5. iCal feed route + token minting UI.
6. Playwright end-to-end verification, screenshots.

## Files touched (est.)

~18 files edited, 3 new files, 1 migration. No breaking changes to schema column names or the coaching_sessions API.

Reply **"go"** to execute A–E as above, or **"go + oauth"** if you also want me to start the Google/Microsoft App User Connector setup (I'll ask for the OAuth client details when we get there).
