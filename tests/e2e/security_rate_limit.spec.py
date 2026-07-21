"""
Security regression: rate limiter enforcement.

Verifies that public.check_rate_limit — the SECURITY DEFINER RPC that backs
every enforceRateLimit() call in the server — actually blocks callers past
the configured threshold, isolates keys, and slides its window.

The primitive is tested directly against the DB rather than through a
server function so the test doesn't require an authenticated bearer token
and remains deterministic regardless of which buckets are wired to which
handlers. Rate-limit rows are pruned by the RPC itself once outside the
window, so this test does not need DELETE privileges on public.rate_limits.

Requires: psql on PATH, $SUPABASE_DB_URL set.
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
    args = ["psql"]
    if PGURI:
        args.append(PGURI)
    args += ["-tAF", "|", "-c", sql]
    r = subprocess.run(args, check=True, capture_output=True, text=True)
    return r.stdout.strip()


def call_limit(bucket: str, key: str, limit: int, window: int) -> tuple[bool, int, int]:
    row = psql(
        "SELECT allowed, remaining, retry_after_seconds "
        f"FROM public.check_rate_limit('{bucket}', '{key}', {limit}, {window});"
    )
    if not row:
        raise AssertionError(f"empty check_rate_limit result for {bucket}/{key}")
    a, rem, retry = row.splitlines()[0].split("|")
    return a == "t", int(rem), int(retry)


def main() -> int:
    # Random bucket so we do not collide with production traffic or previous runs.
    bucket = f"test.security.{uuid.uuid4().hex[:8]}"
    key = f"rl-{uuid.uuid4().hex[:12]}"
    limit = 3
    window = 3  # short window so the slide test finishes quickly

    # 1. First `limit` calls must all be allowed and `remaining` counts down.
    for i in range(limit):
        allowed, remaining, retry = call_limit(bucket, key, limit, window)
        assert allowed, f"call #{i+1} unexpectedly blocked"
        assert remaining == limit - i - 1, f"remaining={remaining} at call #{i+1}"
        assert retry == 0, f"retry_after={retry} while still under limit"

    # 2. Next call must be blocked with a non-zero retry_after within window.
    allowed, remaining, retry = call_limit(bucket, key, limit, window)
    assert not allowed, "limiter failed open — request past threshold was allowed"
    assert remaining == 0, f"remaining={remaining} after block"
    assert 1 <= retry <= window, f"retry_after {retry}s out of expected 1..{window}"

    # 3. Independent key is unaffected (per-key isolation).
    other_key = f"rl-{uuid.uuid4().hex[:12]}"
    allowed, _, _ = call_limit(bucket, other_key, limit, window)
    assert allowed, "independent key was blocked — limiter is not scoped by key"

    # 4. Sliding window: wait past the window; the RPC prunes old rows and
    # the next call is allowed again.
    time.sleep(window + 1)
    allowed, remaining, _ = call_limit(bucket, key, limit, window)
    assert allowed, "window did not slide — limiter still blocking after expiry"
    assert remaining == limit - 1, f"remaining did not reset after slide (got {remaining})"

    print("[security_rate_limit] OK — throttles past threshold, isolates keys, slides window")
    return 0


if __name__ == "__main__":
    sys.exit(main())
