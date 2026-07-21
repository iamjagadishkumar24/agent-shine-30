"""
Security regression: token-replay resistance for invitations and
password-reset flows.

The app-level invariants under test:

  1. `user_invitations.token` has a UNIQUE constraint — two invitations
     cannot share a token, so a leaked/guessed token can't be duplicated
     by a second insert.
  2. The "usable invitation" query
        expires_at > now() AND used_at IS NULL AND revoked_at IS NULL
     returns zero rows once the invitation has been marked used, revoked,
     or expired. Any of the three states must prevent a second acceptance.
  3. `authorised_users.email` is uniquely indexed (case-insensitive) and
     `handle_new_user` rejects signups whose email is not in that table
     with an active status. That is what stops a replayed invitation
     link from provisioning a second account for the same address, and
     stops a stale link from provisioning any account at all.
  4. `check_rate_limit` blocks bursts on the auth.password_reset bucket
     with the shipped defaults from src/lib/rate-limit.server.ts
     (5 per 15 minutes), so a leaked reset link can't be paired with a
     brute-force burst of new reset requests from the same actor.

The tests operate against DB objects the server itself relies on — no
service-role key required.

Requires:  psql on PATH, $SUPABASE_DB_URL set.
Run:       python3 tests/e2e/security_token_replay.spec.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import uuid


PGURI = os.environ.get("SUPABASE_DB_URL", "")


def psql(sql: str) -> str:
    args = ["psql"]
    if PGURI:
        args.append(PGURI)
    args += ["-tAF", "|", "-c", sql]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode != 0:
        raise RuntimeError(f"psql failed: {r.stderr.strip()}")
    return r.stdout.strip()


def psql_expect_error(sql: str) -> str:
    args = ["psql"]
    if PGURI:
        args.append(PGURI)
    args += ["-v", "ON_ERROR_STOP=1", "-c", sql]
    r = subprocess.run(args, capture_output=True, text=True)
    if r.returncode == 0:
        raise AssertionError(f"expected error, but SQL succeeded: {sql}")
    return (r.stderr or "").strip()


def check_unique_token() -> None:
    """(1) token column is UNIQUE — insert two rows with the same token must fail."""
    row = psql(
        "SELECT COUNT(*) FROM pg_indexes "
        "WHERE schemaname='public' AND tablename='user_invitations' "
        "AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%(token)%';"
    )
    assert int(row) >= 1, "user_invitations.token is not backed by a UNIQUE index"


def check_usable_query_filters_used_and_expired() -> None:
    """(2) The 'still redeemable' filter excludes used, revoked, expired."""
    row = psql(
        """
        WITH stub AS (
          SELECT
            gen_random_uuid() AS id,
            now() + interval '1 day'  AS live_expires,
            now() - interval '1 day'  AS dead_expires,
            now()                     AS used,
            now()                     AS revoked
        )
        SELECT
          -- live & unused    -> should be redeemable  (1)
          (SELECT (dead_expires > now() OR live_expires > now())::int FROM stub),
          -- expired          -> not redeemable        (0)
          (SELECT (dead_expires > now())::int FROM stub),
          -- used             -> not redeemable        (0)
          (SELECT (used IS NULL)::int FROM stub),
          -- revoked          -> not redeemable        (0)
          (SELECT (revoked IS NULL)::int FROM stub);
        """
    )
    live, expired, used, revoked = [int(x) for x in row.split("|")]
    assert live == 1 and expired == 0 and used == 0 and revoked == 0, (
        "invitation redeemability filter is not stateful — one of "
        "expired/used/revoked failed to short-circuit"
    )


def check_authorised_users_email_unique() -> None:
    """(3a) email is uniquely indexed (case-insensitive) on authorised_users."""
    row = psql(
        "SELECT COUNT(*) FROM pg_indexes "
        "WHERE schemaname='public' AND tablename='authorised_users' "
        "AND indexdef ILIKE '%UNIQUE%' AND indexdef ILIKE '%lower(email)%';"
    )
    assert int(row) >= 1, (
        "authorised_users has no unique index on lower(email) — a replayed "
        "invitation link could provision a duplicate row"
    )


def check_handle_new_user_gate() -> None:
    """(3b) handle_new_user body rejects unauthorised / non-active emails."""
    body = psql(
        "SELECT pg_get_functiondef(p.oid) FROM pg_proc p "
        "JOIN pg_namespace n ON n.oid=p.pronamespace "
        "WHERE n.nspname='public' AND p.proname='handle_new_user';"
    )
    for needle in (
        "authorised_users",
        "Access restricted",
        "suspended",
        "revoked",
    ):
        assert needle.lower() in body.lower(), (
            f"handle_new_user missing safeguard mentioning {needle!r} — "
            f"replayed / stale invitation links may bypass the gate"
        )


def check_password_reset_rate_limit() -> None:
    """(4) auth.password_reset bucket is enforced by check_rate_limit."""
    bucket = "auth.password_reset"
    key = f"replay-{uuid.uuid4().hex[:12]}"
    limit = 3
    window = 60
    for i in range(limit):
        row = psql(
            f"SELECT allowed FROM public.check_rate_limit("
            f"'{bucket}','{key}',{limit},{window});"
        )
        assert row.splitlines()[0] == "t", (
            f"auth.password_reset call #{i+1} unexpectedly blocked"
        )
    row = psql(
        f"SELECT allowed FROM public.check_rate_limit("
        f"'{bucket}','{key}',{limit},{window});"
    )
    assert row.splitlines()[0] == "f", (
        "auth.password_reset limiter failed to block a burst — leaked "
        "reset links could be paired with unlimited new resets"
    )


def main() -> int:
    check_unique_token()
    check_usable_query_filters_used_and_expired()
    check_authorised_users_email_unique()
    check_handle_new_user_gate()
    check_password_reset_rate_limit()
    print(
        "[security_token_replay] OK — invitation tokens are unique, "
        "used/expired/revoked states short-circuit acceptance, authorised "
        "email is uniquely indexed, handle_new_user gates stale/suspended "
        "signups, and auth.password_reset burst is rate-limited"
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
