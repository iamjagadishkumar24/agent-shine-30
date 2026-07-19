# Zenwork Security & Auth Hardening — Realistic Plan

The prompt is generic enterprise-security boilerplate. Much of it is either **already handled by Supabase Auth / Lovable Cloud** or **not implementable on this runtime**. Below is what's actually already in place, what can't be done, and what I propose to build.

---

## Already handled (no work needed)

- **Password hashing** — Supabase Auth uses bcrypt server-side. We never see plaintext.
- **HIBP breached-password check** — enabled via `configure_auth` (currently on; verified).
- **Session cookies (httpOnly, SameSite, CSRF)** — Supabase Auth issues secure tokens; our app uses bearer + short-lived JWT, so classic CSRF doesn't apply to server functions.
- **HTTPS + TLS 1.3** — Cloudflare edge terminates everything.
- **MFA (TOTP), password reset, email verification, RLS/RBAC, `user_roles` separation, audit log (`feedback_audit_log`)** — already implemented previously.
- **Login / signup / reset-password UI** — was redesigned two turns ago (glassmorphism, strength meter, remember me, show/hide, Zenwork wordmark). Not redoing unless you want a specific change.
- **Google OAuth** — configured through Lovable broker.

## Cannot be done on this stack (transparent about the gap)

- **BullMQ / Redis** — Cloudflare Workers can't run either. Email queue already uses Postgres + pg_cron; that's the durable equivalent.
- **Backend rate limiting** — Lovable has no standard rate-limit primitive. Auth-route rate limiting is enforced by Supabase Auth itself (login/signup/reset hourly caps). Custom per-endpoint rate limiting on server functions isn't shippable here.
- **Malware scanning of uploads** — no ClamAV / VirusTotal on Workers. We can validate MIME + magic bytes + size + extension whitelist, and rely on Supabase Storage's isolated bucket.
- **Argon2id** — Supabase Auth uses bcrypt; we can't swap the hash algo.
- **AES-256 at rest for arbitrary data** — Postgres storage is already encrypted at rest by the provider; column-level encryption for user data isn't on the roadmap in this scope.

## What I propose to build this turn — pick which phases

### Phase A — Audit & report (fast, high value)
1. Run `security--run_security_scan` + `supabase--linter` + `code--dependency_scan`.
2. Produce a written security report: findings by severity, what's fixed, what's accepted risk, what's platform-limited.
3. Fix any Critical/High RLS or dependency issues surfaced by scans.

### Phase B — Server-side input validation sweep
- Audit every `createServerFn` under `src/lib/**/*.functions.ts` and every `src/routes/api/**` route.
- Ensure each has strict `zod` `.inputValidator()` with type/length/format/enum/UUID/email constraints, `.strict()` on objects, and refined error mapping.
- Return generic user-facing messages; log the real error server-side.

### Phase C — Error-leak hardening
- Add a global response wrapper in server fns / routes that converts thrown errors to `{ code, message }` with a stable request ID.
- Replace all `throw new Error(<internal detail>)` with `throw new PublicError(<code>, <friendly>)` and log the internal detail via `console.error`.
- Update `errorComponent` / `defaultErrorComponent` in the router to show only "Something went wrong · request ID xxx".

### Phase D — Secure file uploads
- Add magic-byte sniff + MIME + extension whitelist + size cap on `feedback_attachments` uploads.
- Random UUID filenames (already in place, verify).
- Reject executables / SVG-with-scripts.

### Phase E — Security headers (edge response)
- Add a request middleware in `src/start.ts` that sets on every HTML response: `Content-Security-Policy` (nonce-based), `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=()`, `Cross-Origin-Opener-Policy: same-origin`.
- Verify with `curl -I` and browser DevTools.

### Phase F — Security dashboard for admins
- New route `_authenticated/security` (admin/qa_admin only) showing:
  - Recent sign-ins (from `auth.audit_log_entries`, read via server fn with `supabaseAdmin`).
  - Active user list + last-seen.
  - `feedback_audit_log` events (last 200).
  - Email queue failures.
  - Supabase linter status snapshot.
- Read-only, RLS-scoped.

### Phase G — Dependency upgrades
- Run `bun update` for anything the dep-scan flags as High/Critical.
- Note any unresolvable transitive advisories.

---

## Suggested execution order

If you want everything, we ship A + C + E + F this turn (highest security ROI, low regression risk), then B + D + G in a follow-up.

If you want it all in one shot, expect a large diff and I'll need to move in phases anyway — I'll implement, run typecheck + scans between phases, and post the audit report at the end.

## Not doing unless you insist

- Rewriting login/signup UI — already premium and matches the brief.
- Building custom rate-limiting middleware — Supabase already caps auth routes, and the platform has no primitive for the rest.
- Swapping password hash to Argon2id — not user-configurable.
- BullMQ/Redis — replaced by pg_cron queue, already in place.

**Reply with the phases you want (e.g. "A, C, E, F") or "all of it" and I'll execute.**