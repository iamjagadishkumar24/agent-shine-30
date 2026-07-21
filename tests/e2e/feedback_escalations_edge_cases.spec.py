"""
Regression: feedback-escalations webhook must fail safely for malformed input
and expired acknowledgements. Reminders are disabled, so every one of these
edge cases must:

  * return HTTP 200 with {disabled: true, processed: 0}
  * never insert into email_queue(kind='reminder'), feedback_reminders,
    or feedback_email_events(event_type='reminder_queued')
  * still write an access_audit_logs entry

Covered payloads:
  1. missing body (Content-Length: 0)
  2. malformed JSON body
  3. missing feedback_id field
  4. malformed feedback_id (non-UUID string)
  5. unknown feedback_id (well-formed UUID that doesn't exist)
  6. real feedback row whose acknowledgement_due_at is in the past (expired)

Requires: psql on PATH, PG* env vars set, network egress to APP_BASE_URL.
Run:  python3 tests/e2e/feedback_escalations_edge_cases.spec.py
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


def psql(sql: str) -> str:
    r = subprocess.run(
        ["psql", "-tAF", "|", "-c", sql],
        check=True, capture_output=True, text=True,
    )
    return r.stdout.strip()


def count(table: str, where: str) -> int:
    return int(psql(f"SELECT count(*) FROM public.{table} WHERE {where}") or "0")


def post(body: bytes, content_type: str = "application/json") -> tuple[int, dict]:
    req = urllib.request.Request(
        ENDPOINT, data=body, method="POST",
        headers={"Content-Type": content_type, "User-Agent": "qualipulse-e2e/1.0"},
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


def find_expired_feedback_id() -> str | None:
    """Return a feedback row id whose acknowledgement_due_at is in the past."""
    out = psql(
        "SELECT id FROM public.feedback "
        "WHERE acknowledgement_due_at IS NOT NULL "
        "  AND acknowledgement_due_at < now() "
        "  AND acknowledged_at IS NULL "
        "ORDER BY acknowledgement_due_at ASC LIMIT 1"
    )
    return out or None


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

    expired_id = find_expired_feedback_id()
    if expired_id:
        print(f"info using expired feedback row {expired_id}")
    else:
        print("info no naturally expired feedback row found; skipping case 6")

    cases: list[tuple[str, bytes, str]] = [
        ("empty body", b"", "application/json"),
        ("malformed JSON", b"{not-json", "application/json"),
        ("missing feedback_id", b"{}", "application/json"),
        ("malformed feedback_id",
         json.dumps({"feedback_id": "not-a-uuid"}).encode(), "application/json"),
        ("unknown feedback_id",
         json.dumps({"feedback_id": "00000000-0000-0000-0000-000000000000"}).encode(),
         "application/json"),
    ]
    if expired_id:
        cases.append((
            "expired acknowledgement",
            json.dumps({"feedback_id": expired_id}).encode(),
            "application/json",
        ))

    for label, body, ctype in cases:
        status, resp = post(body, ctype)
        assert_eq(status, 200, f"{label} -> HTTP 200")
        assert_eq(resp.get("disabled"), True, f"{label} -> disabled=true")
        assert_eq(resp.get("processed"), 0, f"{label} -> processed=0")

    # No reminder side effects for any of the edge cases
    for table, before in baselines.items():
        where = (
            "kind='reminder'" if table == "email_queue"
            else "event_type='reminder_queued'" if table == "feedback_email_events"
            else "true"
        )
        after = count(table, where)
        assert_eq(after, before, f"no new rows in {table} ({where})")

    # One audit row per invocation
    audit_after = count(
        "access_audit_logs",
        "action='feedback_escalations.invoked_while_disabled'",
    )
    delta = audit_after - audit_before
    if delta < len(cases):
        fail(f"audit rows: expected +{len(cases)}, got +{delta}")
    print(f"ok   audit rows written (+{delta})")

    # Expired feedback row must not have flipped to a reminder-driven state
    if expired_id:
        row = psql(
            "SELECT coalesce(acknowledgement_status,'') || '|' || "
            "coalesce(last_reminder_sent_at::text,'') "
            "FROM public.feedback WHERE id='" + expired_id + "'"
        )
        status_val, _, last_sent = row.partition("|")
        assert_eq(last_sent, "", "expired row: last_reminder_sent_at untouched")
        if status_val == "reminder_sent":
            fail(f"expired row status advanced to reminder_sent: {status_val!r}")
        print(f"ok   expired row status preserved ({status_val!r})")

    print("\nAll feedback-escalations edge-case regressions pass.")


if __name__ == "__main__":
    main()
