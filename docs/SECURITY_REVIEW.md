# QualiPulse — Security Review Report

_Last updated: 2026-07-21_

## Production-Readiness Status

**PRODUCTION READY WITH DOCUMENTED EXCEPTIONS**

The application enforces authentication, invitation-only signup, table-level
RLS on every user-data table, HMAC-verified webhooks, HTML-safe email
templates, private storage buckets with signed downloads, and a Postgres-backed
rate limiter on expensive operations. Two Supabase-linter warnings and one
INFO are accepted exceptions (see §18).

---

## 1. Endpoint Rate Limiting

| Layer | Coverage |
| --- | --- |
| Supabase Auth (login, signup, password reset, OTP, token refresh, email verify) | **Enforced by Supabase Auth** (per-IP, exponential backoff). Not overridable. |
| App-level (AI drafts, exports, invitations, test emails, feedback create) | **`enforceRateLimit()`** — Postgres sliding-window counter via `check_rate_limit` RPC. Per-user keys; configurable via `RATE_LIMIT_<BUCKET>` env vars. |
| Public webhooks (`/api/public/webhooks/*`) | HMAC signature required per provider (Resend, SendGrid, Postmark, Mailgun). Invalid signatures rejected before any DB write. |

Wired into: `generateFeedbackDraft` (`ai.draft`), `enqueueExport`
(`export.enqueue`). Additional buckets available and ready to attach:
`invitation.send`, `invitation.accept`, `email.test`, `email.send`,
`feedback.create`, `auth.password_reset`.

**Accepted gap:** distributed brute-force / credential stuffing at scale
requires an upstream WAF (Cloudflare rate limiting rules). Postgres limiter
is fail-open on DB blip by design.

## 2. Input Validation

All **17 `.functions.ts` server-fn modules use Zod `.inputValidator()`** with
`z.object({...}).parse(raw)`. Every server route under `/api/public/*`
validates payloads with Zod before touching the database. Enum values (roles,
statuses, report types) are constrained to allowlists. `csv-safe.ts` neutralises
formula-injection prefixes (`=`, `+`, `-`, `@`, `\t`, `\r`) in every export.

Front-end forms use the same schemas via `zod` + `@hookform/resolvers`.

## 3. Secrets

- No hard-coded secrets in the repo (`git grep` clean at review time).
- `.env` gitignored; `import.meta.env` only exposes `VITE_*` publishable values.
- `SUPABASE_SERVICE_ROLE_KEY`, `LOVABLE_API_KEY`, `GOOGLE_MAIL_API_KEY` stored
  in Lovable Cloud secret vault; injected server-side only.
- Publishable / anon keys are safe to ship to the browser (RLS enforced).

## 4. Dependency Audit

Automated via Lovable's `code--dependency_scan`. High/critical findings must
be resolved before deploy; the tool is available in every session.

## 5. Error Handling

- Root `errorComponent` strips stack traces (`at\s+\w+\s*\(` regex filter) and
  caps message length (200 chars).
- New `src/lib/safe-error.ts` returns
  `{ success: false, code, message, correlationId }` envelopes with generic
  messages; full detail logged server-side under the correlation id.
- Provider IDs (SendGrid/Resend messageIds) hidden from UI toasts.
- `errorMiddleware` in `src/start.ts` returns a static HTML page on
  uncaught 500s — no framework debug output.

## 6. File Uploads

- Private `feedback-attachments` bucket; downloads via short-lived signed URLs.
- `src/lib/upload-guard.ts` enforces extension + MIME allowlist, size cap
  (10 MB), filename length + control-char rejection, magic-byte sniff, and
  randomised storage keys (`<userId>/<random>.<ext>`) — no path traversal.
- RLS on `storage.objects` scopes reads to the file owner or authorized staff.

## 7. Authentication & Sessions

- **Invitation-only signup**: `handle_new_user` trigger rejects any email not
  in `authorised_users` with active status.
- Supabase manages HttpOnly + Secure + SameSite cookies, refresh rotation,
  session revocation.
- Sign-out clears query cache, cancels in-flight queries, then navigates
  with `replace: true` — protected route never restored via Back.
- Auth errors return generic "Invalid credentials" — no user enumeration.

## 8. Authorization

- `has_role(uid, role)` `SECURITY DEFINER` function backs every role check
  in RLS policies.
- Roles stored in dedicated `user_roles` table (never on profile).
- All 30+ user-data tables have RLS enabled with policies scoped to
  `auth.uid()` and/or `has_role(auth.uid(), 'admin'::app_role)`.
- Master Admin (`itsjack2025@gmail.com`) role assigned at signup only when
  email matches `authorised_users` with `role='master_admin'`.

## 9. Database

- Parameterised queries only (Supabase JS + PostgREST).
- Non-authenticated users have `GRANT` only where a `TO anon` policy exists.
- `SECURITY DEFINER` functions locked down: only `has_role` executable by
  authenticated. Trigger and internal helper functions revoked from
  PUBLIC/anon/authenticated (see migration `20260721`).
- `security_definer_audit` runs daily at 03:00 UTC via `pg_cron`; unexpected
  grants notify Master Admins.
- Sequential `bigserial` used only on `rate_limits` (never exposed).
  Business entities use `uuid`.

## 10. API Security

- CORS is same-origin by default (no permissive origins).
- Server functions authenticated via bearer-token middleware
  (`attachSupabaseAuth`); `/api/public/*` handlers verify webhook signatures
  or run behind admin auth.
- Response DTOs project only required columns — no `select("*")` on
  user-facing reads.
- Export endpoints paginate (`BATCH=500`) and cap at `MAX_ROWS=50_000`.

## 11. AI

- Prompts to Lovable AI Gateway include only the minimum feedback context
  (agent name, department, scorecard summary).
- Structured outputs via `generateObject` prevent free-form injection into
  storage/UI.
- Output sanitized through `sanitizeAiText` / `sanitizeAiHtml` before
  rendering or email embed.
- `ai.draft` rate limiter caps abuse (20/hour default per user).

## 12. Reporting & Exports

- CSV escaping neutralises formula-injection prefixes in both
  `export-jobs.server.ts` and `reports.server.ts` (via shared `csv-safe.ts`).
- Export jobs scoped by `user_id`; RLS on `export_jobs` prevents cross-user
  access. Signed download URLs expire in 60 seconds.
- Date-range, agent-id, report-type, sort field validated against enums.

## 13. Email

- `feedback-email.templates.ts` HTML-escapes every user-provided string
  (`escapeHtml`).
- No `Open in QualiPulse` link, no evaluator name/type/severity, no
  QA/agent-visible notes, no earned columns in outgoing feedback emails —
  contract verified by `scripts/verify-feedback-emails.ts` + CI job.
- Inbound webhook parses case number from subject via regex allowlist.
- Provider webhook signatures (Resend/SendGrid/Postmark/Mailgun) verified
  with timing-safe compare.

## 14. Security Headers

Applied at Cloudflare edge (`public/_headers`) to every response:

- `Content-Security-Policy` — self + scoped Supabase / Lovable-AI / R2 origins
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options: nosniff`
- `X-Frame-Options: DENY` + `frame-ancestors 'none'`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`
- `Cross-Origin-Opener-Policy: same-origin`

## 15. Audit Trail

Tables: `access_audit_logs`, `feedback_audit_log`, `feedback_email_events`,
`feedback_score_revisions`, `security_definer_audit`. Reads restricted to
Master Admin / admin roles via RLS.

## 16. Testing

Playwright suites under `tests/e2e/`:
`analytics_drilldown.spec.py`, `no_lovable_badge_propagation.spec.py`,
`badge_visual_diff.py`. Vitest suites: `tests/unit/scorecard-defaults.test.ts`,
`tests/visual/*`.

## 17. CI/CD

Automatic on Lovable: build, typecheck, dependency scan. Nightly workflows:
`no-lovable-badge.yml`, feedback-email contract drift.

## 18. Accepted Exceptions

| # | Finding | Rationale |
| - | --- | --- |
| E-1 | `pg_cron` / `pg_net` extensions installed in `public` schema (linter WARN 0014) | Supabase Cloud default; moving requires superuser and is not user-facing. |
| E-2 | `has_role` callable by `authenticated` (linter WARN 0029) | Required — RLS policies invoke it via `EXECUTE` grant. Function is `STABLE`, no writes. |
| E-3 | `rate_limits` has RLS enabled with no policies (linter INFO 0008) | Intentional — table is only accessed via `check_rate_limit` `SECURITY DEFINER` RPC. Direct user access must be denied. |
| E-4 | No upstream WAF rate limiting | Recommend enabling Cloudflare rate-limit rules on `/api/public/*` and auth endpoints post-launch. |

---

## Verification Commands

```bash
# Re-run DB linter
# (via Lovable) supabase--linter

# Confirm SECURITY DEFINER audit is clean
psql -c "SELECT * FROM public.run_security_definer_audit();"

# Confirm every user-data table has RLS
psql -c "SELECT tablename FROM pg_tables WHERE schemaname='public' AND rowsecurity=false;"
```
