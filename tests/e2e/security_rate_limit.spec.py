"""
Security regression: rate limiter enforcement.

Verifies that public.check_rate_limit — the SECURITY DEFINER RPC that backs
every enforceRateLimit() call in the server — actually blocks callers past
the configured threshold and reports a sane retry_after.

The primitive is tested directly against the DB rather than through a
server function so the test doesn't require an authenticated bearer token
and remains deterministic regardless of which buckets are wired to which
handlers.

Requires: psql on PATH with $SUPABASE_DB_URL / $PGHOST already set.
Run:  python3 tests/e2e/security_rate_limit.spec.py
"""

from __future__ import annotations

import os
import subprocess
import sys
import time
import uuid


PGURI = os.environ.get("SUPABASE_DB_URL", "")


def psql(sql: str) -> str:
    args = ["psql", "-tAF", "|", "-c", sql]
    if PGURI:
        args = ["psql", PGURI, "-tAF", "|", "-c", sql]
    r = subprocess.run(args, check=True, capture_output=True, text=True)
    return r.stdout.strip()


def call_limit(bucket: str, key: str, limit: int, window: int) -> tuple[bool, int, int]:
    row = psql(
        f"SELECT allowed, remaining, retry_after_seconds "
        f"FROM public.check_rate_limit("
        f"'{bucket}', '{key}', {limit}, {window});"
    )
    if not row:
        raise AssertionError(f"empty check_rate_limit result for {bucket}/{key}")
    a, rem, retry = row.splitlines()[0].split("|")
    return a == "t", int(rem), int(retry)


def cleanup(bucket: str, key: str) -> None:
    psql(f"DELETE FROM public.rate_limits WHERE bucket='{bucket}' AND key='{key}';")


def main() -> int:
    bucket = "test.security"
    key = f"rl-{uuid.uuid4().hex[:12]}"
    limit = 3
    window = 30

    try:
        # 1. First `limit` calls must all be allowed and `remaining` counts down.
        for i in range(limit):
            allowed, remaining, retry = call_limit(bucket, key, limit, window)
            assert allowed, f"call #{i+1} unexpectedly blocked"
            assert remaining == limit - i - 1, f"remaining={remaining} at call #{i+1}"
            assert retry == 0, f"retry_after={retry} while still under limit"

        # 2. Next call must be blocked with a non-zero retry_after.
        allowed, remaining, retry = call_limit(bucket, key, limit, window)
        assert not allowed, "limiter failed open — request past threshold was allowed"
        assert remaining == 0, f"remaining={remaining} after block"
        assert 1 <= retry <= window, f"retry_after {retry}s out of expected 1..{window}"

        # 3. Independent key is unaffected (per-key isolation).
        other_key = f"rl-{uuid.uuid4().hex[:12]}"
        allowed, _, _ = call_limit(bucket, other_key, limit, window)
        assert allowed, "independent key was blocked — limiter is not scoped by key"
        cleanup(bucket, other_key)

        # 4. Sliding window: expire the row, next call for the original key is allowed again.
        psql(
            f"UPDATE public.rate_limits SET hit_at = now() - interval '{window+5} seconds' "
            f"WHERE bucket='{bucket}' AND key='{key}';"
        )
        allowed, _, _ = call_limit(bucket, key, limit, window)
        assert allowed, "window did not slide — limiter still blocking after expiry"

        print("[security_rate_limit] OK — limiter blocks past threshold, isolates keys, slides window")
        return 0
    finally:
        cleanup(bucket, key)


if __name__ == "__main__":
    sys.exit(main())
