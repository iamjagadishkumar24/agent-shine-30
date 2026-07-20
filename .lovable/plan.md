
# Incremental QA Platform Buildout

Keep every existing surface (feedback CRUD, coaching, notifications, email pipeline, AI draft, realtime, RLS, audit log). Layer the missing pieces on top in ordered phases so each phase ships value on its own.

## Role mapping (rename in place, no data migration risk)

- `super_admin` → **Admin** (label only)
- `qa_admin` → **Quality Analyst**
- `team_manager` → **Team Leader**
- `agent` → **Agent**

Only UI labels + a `roleLabels` map change; RLS policies stay on existing role names.

## Phase 1 — Data model additions (one migration)

New tables:
- `teams` (name, description, leader_user_id)
- `scorecard_templates` (name, is_active, version)
- `scorecard_parameters` (template_id, name, max_points, order) — seeded with the 7 required parameters totalling 100
- `feedback_scores` (feedback_id, parameter_name snapshot, max_points snapshot, selected_percentage, earned_points, evaluator_note) — historical snapshot per feedback
- `feedback_disputes` (feedback_id, raised_by, reason, status, resolution_note, resolved_by, resolved_at)
- `feedback_score_revisions` (dispute_id, parameter_name, original_percentage, revised_percentage, original_earned, revised_earned) — full re-evaluation history

Column additions:
- `agents.team_id` (FK teams)
- `feedback.interaction_type` (chat|case), `interaction_reference`, `interaction_date`, `evaluator_id`, `team_id`, `tags text[]`, `internal_notes`, `agent_visible_notes`, `overall_score numeric`, `overall_percentage numeric`, `performance_label`
- Extend `feedback_status` enum with: `submitted`, `finalized`, `disputed`, `resolved`, `archived`

All new tables: GRANT + RLS (agent sees own; team leader sees team; analyst sees all; admin all). Trigger recalculates overall_score/label server-side on feedback_scores insert/update, rejects totals > 100, and blocks client-supplied overall_score drift.

## Phase 2 — Scorecard-driven New Feedback form

Rework `/feedback/new`:
- Add Interaction Type, Interaction Reference, Interaction Date, Team (auto from agent, editable), Tags, Evaluator (defaults to current user).
- New "Quality Evaluation" section: 7 parameter cards, each with synced slider + numeric input, live earned points, optional note.
- Live Overall Score card with points/100, %, progress bar, performance label.
- Split notes into Internal Notes + Agent-Visible Notes.
- AI Draft: pass all 7 scores + notes + tags into `generateFeedbackDraft`; add Regenerate / Make Concise / Make Detailed / Insert into Form controls. Keep existing template picker.
- Actions: Save Draft, Preview, Submit, Submit and Send Email. Server recomputes earned points + overall from percentages before persisting.

## Phase 3 — Detail, History, Email

- Feedback Detail: render 7-parameter table (max / % / earned / note), overall bar, performance label, dispute panel, audit timeline (already exists — extend with revisions).
- Feedback History: add columns for Interaction Type, Team, Evaluator, Email Status; add filters for team / interaction type / evaluator / score range; keep existing responsive card fallback.
- Email template: replace freeform body block with the 7-row score table + totals row, keep existing branded header/footer and tracking.

## Phase 4 — Disputes with re-scoring

- Agent portal: "Dispute" action on Sent/Acknowledged feedback → dialog with reason → status `disputed`, notification to evaluator + analysts.
- Analyst view: dispute inbox in feedback detail — can adjust each of the 7 percentages; each change writes a `feedback_score_revisions` row; on save, recompute overall + set status `resolved`; notify agent with diff.
- Full history rendered in audit timeline: original vs revised per parameter.

## Phase 5 — Teams + User Management + Scorecard Settings

- `/teams` (Admin/Analyst): CRUD teams, assign leader, list members.
- `/settings/users` (Admin): list auth users, assign roles, deactivate, resend invite.
- `/settings/scorecard` (Admin): view active template + 7 parameters, edit names/weights, must sum to 100 (server-enforced). Editing creates a new version; existing feedback keeps its snapshot.

## Phase 6 — Global dashboard with date range + server-side aggregation

- Add sticky date-range bar (From / To / Apply / Reset + presets: 7d / 30d / This Month / This Year) at top of `/dashboard`, `/analytics`, `/analytics/email`. Persist to URL search params.
- New `dashboard-metrics.functions.ts` server functions doing SQL aggregation for every KPI/chart (no full-table client reads):
  - KPIs: Total Feedback, Avg Overall Score, Pass Rate (≥70), Failed Evaluations (<70), Critical Feedback, Agents Evaluated, Feedback Sent, Acknowledgement Rate, Open Disputes, per-parameter averages.
  - Charts: Quality Score Trend, Volume Trend, Score Distribution, Interaction Type/Severity Distribution, Parameter Performance, Agent Rankings, Team Performance, Low-Scoring Parameters, Status Funnel.
- All charts reuse existing chart primitives; realtime invalidation on `feedback`, `feedback_scores`, `feedback_disputes`.

## Phase 7 — Tests

Extend existing Playwright/Vitest suites:
- Unit: weighted calc (`earned = max * pct / 100`, overall sum, label thresholds).
- Server: reject totals > 100, reject client-supplied overall, RLS matrix per role.
- E2E: submit feedback → email score table renders → agent acknowledges → dispute → re-score → dashboard KPIs update.

## Technical details

- Migrations: single Supabase migration per phase (Phase 1 is the largest). All new public tables get GRANTs + RLS in the same migration.
- Server-side scoring: DB trigger on `feedback_scores` recomputes and writes `feedback.overall_score`, `overall_percentage`, `performance_label`; blocks inserts where sum(max_points) ≠ 100 for the active template.
- Aggregation: PostgreSQL views / RPCs called from `createServerFn` under `requireSupabaseAuth`; results cached in TanStack Query keyed by `[metric, from, to, filters]`.
- AI Draft: extend the existing `generateFeedbackDraft` input schema with `scores` array; prompt updated to ground strengths on top-3 parameters and improvements on bottom-3.
- Realtime: extend `useRealtimeInvalidate` calls to include new tables.
- Role labels: single `src/lib/roles.ts` map — no policy changes.

## What is intentionally NOT in scope

- No rebuild of auth, coaching, email provider layer, notification system, or existing tests — they already meet the spec.
- No badge/branding changes.
- Coaching-actions linkage to feedback stays as-is (already wired).

## Rollout order

Phase 1 → 2 → 3 in the first pass (unlocks the weighted scorecard end-to-end). Phases 4–7 land as follow-up turns so each is reviewable.
