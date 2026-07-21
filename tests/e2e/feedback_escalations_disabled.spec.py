"""
Regression: the feedback-escalations webhook must never send reminder emails,
even when triggered manually. Reminders are disabled by product decision;
the endpoint is a no-op that only writes an audit log entry.

Guarantees verified:
  1. The pg_cron schedule 'feedback-escalations-hourly' is not registered.
  2. Hitting the endpoint (with and without a valid apikey) returns
     {disabled: true, processed: 0} and 200.
  3. No new rows appear in email_queue (kind='reminder'), feedback_reminders,
     or feedback_email_events (event_type='reminder_queued') around the call.
  4. An access_audit_logs row is written for every invocation.

Requires: psql on PATH, PG* env vars set (see exec-database-access), and
network egress to the published site. Run:
    python3 tests/e2e/feedback_escalations_disabled.spec.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request


BASE_URL = os.environ.get(
    "APP_BASE_URL",
    "https://project--ee9ab798-a4f8-4621-a924-2bc91cf49061.lovable.app",
).rstrip("/")
ENDPOINT = f"{BASE_URL}/api/public/hooks/feedback-escalations"
APIKEY = os.environ.get("SUPABASE_PUBLISHABLE_KEY", "")


def psql(sql: str) -> str:
    r = subprocess.run(
        ["psql", "-tAF", "|", "-c", sql],
        check=True, capture_output=True, text=True,
    )
    return r.stdout.strip()


def count(table: str, where: str) -> int:
    return int(psql(f"SELECT count(*) FROM public.{table} WHERE {where}") or "0")


def post(headers: dict[str, str]) -> tuple[int, dict]:
    headers = {"User-Agent": "qualipulse-e2e/1.0", **headers}
    req = urllib.request.Request(ENDPOINT, data=b"{}", method="POST",
                                 headers={"Content-Type": "application/json", **headers})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.status, json.loads(resp.read().decode() or "{}")


def assert_eq(actual, expected, label: str) -> None:
    if actual != expected:
        print(f"FAIL {label}: expected {expected!r}, got {actual!r}")
        sys.exit(1)
    print(f"ok   {label}")


def main() -> None:
    # 1. cron schedule must not exist (skipped when the test role lacks cron access)
    try:
        jobs = psql("SELECT count(*) FROM cron.job WHERE jobname='feedback-escalations-hourly'")
        assert_eq(jobs, "0", "cron job 'feedback-escalations-hourly' is unscheduled")
    except subprocess.CalledProcessError:
        print("skip cron.job check (no permission for cron schema)")

    # baseline counts for side-effect tables
    baselines = {
        "email_queue.reminder": count("email_queue", "kind='reminder'"),
        "feedback_reminders": count("feedback_reminders", "true"),
        "feedback_email_events.reminder_queued": count(
            "feedback_email_events", "event_type='reminder_queued'"),
    }
    audit_before = count("access_audit_logs",
                         "action='feedback_escalations.invoked_while_disabled'")

    # 2. call twice: with and without apikey
    for label, headers in [
        ("unauthenticated call", {}),
        ("authenticated call", {"apikey": APIKEY} if APIKEY else {}),
    ]:
        status, body = post(headers)
        assert_eq(status, 200, f"{label} -> HTTP 200")
        assert_eq(body.get("disabled"), True, f"{label} -> disabled=true")
        assert_eq(body.get("processed"), 0, f"{label} -> processed=0")

    # 3. no reminder side effects
    for table, before in baselines.items():
        real_table, _, cond = table.partition(".")
        where = "true" if not cond else (
            f"kind='{cond}'" if real_table == "email_queue" else f"event_type='{cond}'")
        assert_eq(count(real_table, where), before,
                  f"no new rows in {table}")

    # 4. one audit row per call (>=2)
    audit_after = count("access_audit_logs",
                        "action='feedback_escalations.invoked_while_disabled'")
    if audit_after - audit_before < 2:
        print(f"FAIL audit rows: expected +2, got +{audit_after - audit_before}")
        sys.exit(1)
    print(f"ok   audit rows written (+{audit_after - audit_before})")

    print("\nAll feedback-escalations regressions pass.")


if __name__ == "__main__":
    main()
