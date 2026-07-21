"""
Regression: feedback-escalations webhook must fail safely when the caller's
authentication signal is missing or invalid. Reminders are disabled globally,
so regardless of the apikey header the endpoint MUST:

  * return HTTP 200 with {disabled: true, processed: 0}
  * never insert into email_queue(kind='reminder'), feedback_reminders,
    or feedback_email_events(event_type='reminder_queued')
  * still write an access_audit_logs entry recording the authenticated flag

Covered header variants:
  1. no apikey / authorization header at all
  2. apikey header present but empty
  3. apikey header set to an obviously wrong value
  4. x-api-key header set to a plausible-looking but wrong JWT
  5. authorization: Bearer <wrong> (no apikey)

Requires: psql on PATH, PG* env vars set, network egress to APP_BASE_URL.
Run:  python3 tests/e2e/feedback_escalations_invalid_signature.spec.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

BASE_URL = os.environ.get(
    "APP_BASE_URL",
    "https://agent-shine-30.lovable.app",
).rstrip("/")
ENDPOINT = f"{BASE_URL}/api/public/hooks/feedback-escalations"


def psql(sql: str) -> str:
    r = subprocess.run(
        ["psql", "-tAF", "|", "-c", sql],
        check=True, capture_output=True, text=True,
    )
    return r.stdout.strip()


def count(table: str, where: str) -> int:
    return int(psql(f"SELECT count(*) FROM public.{table} WHERE {where}") or "0")


def post(headers: dict[str, str]) -> tuple[int, dict]:
    merged = {
        "Content-Type": "application/json",
        "User-Agent": "qualipulse-e2e/1.0",
    }
    merged.update(headers)
    req = urllib.request.Request(
        ENDPOINT, data=b"{}", method="POST", headers=merged,
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            raw = resp.read().decode() or "{}"
            try:
                return resp.status, json.loads(raw)
            except json.JSONDecodeError:
                return resp.status, {"_raw": raw}
    except urllib.error.HTTPError as e:
        raw = e.read().decode() or "{}"
        try:
            return e.code, json.loads(raw)
        except json.JSONDecodeError:
            return e.code, {"_raw": raw}


def fail(msg: str) -> None:
    print(f"FAIL {msg}")
    sys.exit(1)


def assert_eq(actual, expected, label: str) -> None:
    if actual != expected:
        fail(f"{label}: expected {expected!r}, got {actual!r}")
    print(f"ok   {label}")


def latest_audit_authenticated_flag() -> str:
    return psql(
        "SELECT coalesce((new_value->>'authenticated')::text,'') "
        "FROM public.access_audit_logs "
        "WHERE action='feedback_escalations.invoked_while_disabled' "
        "ORDER BY created_at DESC LIMIT 1"
    )


def main() -> None:
    baselines = {
        "email_queue": count("email_queue", "kind='reminder'"),
        "feedback_reminders": count("feedback_reminders", "true"),
        "feedback_email_events": count(
            "feedback_email_events", "event_type='reminder_queued'"),
    }
    audit_before = count(
        "access_audit_logs",
        "action='feedback_escalations.invoked_while_disabled'",
    )

    cases: list[tuple[str, dict[str, str]]] = [
        ("no auth headers", {}),
        ("empty apikey", {"apikey": ""}),
        ("wrong apikey", {"apikey": "not-a-real-key"}),
        ("wrong x-api-key JWT-shaped",
         {"x-api-key": "eyJhbGciOiJIUzI1NiJ9.wrong.signature"}),
        ("bearer only, wrong token",
         {"authorization": "Bearer definitely-not-valid"}),
    ]

    for label, headers in cases:
        status, resp = post(headers)
        assert_eq(status, 200, f"{label} -> HTTP 200")
        assert_eq(resp.get("disabled"), True, f"{label} -> disabled=true")
        assert_eq(resp.get("processed"), 0, f"{label} -> processed=0")
        # Every unauthenticated call must be logged with authenticated=false
        flag = latest_audit_authenticated_flag()
        if flag != "false":
            fail(f"{label}: latest audit authenticated flag is {flag!r}, expected 'false'")
        print(f"ok   {label} -> audit row records authenticated=false")

    # No reminder side effects for any invalid-signature variant
    for table, before in baselines.items():
        where = (
            "kind='reminder'" if table == "email_queue"
            else "event_type='reminder_queued'" if table == "feedback_email_events"
            else "true"
        )
        after = count(table, where)
        assert_eq(after, before, f"no new rows in {table} ({where})")

    audit_after = count(
        "access_audit_logs",
        "action='feedback_escalations.invoked_while_disabled'",
    )
    delta = audit_after - audit_before
    if delta < len(cases):
        fail(f"audit rows: expected +{len(cases)}, got +{delta}")
    print(f"ok   audit rows written (+{delta})")

    print("\nAll feedback-escalations invalid-signature regressions pass.")


if __name__ == "__main__":
    main()
