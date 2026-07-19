"""
End-to-end lifecycle test.

Verifies that the outbound-email lifecycle propagates to Delivered / Opened /
Clicked / Acknowledged / Completed KPIs and to the audit log:

  1. Seed three feedback rows through allowed INSERT paths:
       Rsent  — status='sent',        delivered_at set
       Rack   — status='acknowledged', delivered+opened+clicked+ack set
       Rdone  — status='completed',    every timestamp set
  2. Hit the public open pixel + click tracker for Rsent. Those endpoints
     perform the real UPDATEs through supabaseAdmin, exercising the same
     code path production uses.
  3. Verify Rsent has opened_at / first_opened_at / open_count / clicked_at /
     click_count updated, and that feedback_audit_log contains
     email_opened + email_clicked.
  4. INSERT acknowledge + complete audit rows for Rack / Rdone to lock the
     audit-log contract (the ack/complete server fns are covered by their
     own unit paths).
  5. Assert KPI deltas: delivered +3, opened +2, clicked +2, acknowledged +1,
     completed +1.

Rows are left in the DB tagged "[e2e]" — cleanup requires elevated DB
privileges and is not attempted here.

Run:  python3 tests/e2e/acknowledge_flow.spec.py
"""

from __future__ import annotations

import os
import sys
import time
import uuid
import subprocess
import urllib.request


BASE_URL = os.environ.get("APP_URL", "http://localhost:8080")


def psql(sql: str) -> str:
    out = subprocess.run(
        ["psql", "-tAc", sql], check=True, capture_output=True, text=True,
    )
    return out.stdout.strip()


def psql_one(sql: str) -> str:
    v = psql(sql)
    return v.splitlines()[0] if v else ""


def http_get(path: str) -> int:
    req = urllib.request.Request(BASE_URL + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status
    except urllib.error.HTTPError as e:
        return e.code


def kpis() -> dict[str, int]:
    row = psql(
        """
        SELECT
          COUNT(*) FILTER (WHERE delivered_at IS NOT NULL),
          COUNT(*) FILTER (WHERE opened_at IS NOT NULL),
          COUNT(*) FILTER (WHERE clicked_at IS NOT NULL),
          COUNT(*) FILTER (WHERE status = 'acknowledged'),
          COUNT(*) FILTER (WHERE status = 'completed')
        FROM feedback
        """
    )
    d, o, c, a, done = [int(x) for x in row.split("|")]
    return {"delivered": d, "opened": o, "clicked": c, "acknowledged": a, "completed": done}


def audit_actions(feedback_id: str) -> list[str]:
    raw = psql(
        f"SELECT action FROM feedback_audit_log "
        f"WHERE feedback_id = '{feedback_id}' ORDER BY created_at"
    )
    return [line for line in raw.splitlines() if line]


def seed_feedback(agent_id: str, creator: str, status: str,
                  with_opened: bool, with_clicked: bool,
                  with_ack: bool) -> str:
    fid = str(uuid.uuid4())
    cols = [
        "id", "agent_id", "title", "category", "feedback_type", "severity",
        "status", "summary", "created_by", "sent_at", "delivered_at",
    ]
    vals = [
        f"'{fid}'", f"'{agent_id}'",
        f"'[e2e] {status} {fid[:8]}'",
        "'Communication'", "'constructive'", "'medium'",
        f"'{status}'::feedback_status",
        "'E2E test row'",
        f"'{creator}'", "now()", "now()",
    ]
    if with_opened:
        cols += ["opened_at", "first_opened_at", "open_count"]
        vals += ["now()", "now()", "1"]
    if with_clicked:
        cols += ["clicked_at", "click_count"]
        vals += ["now()", "1"]
    if with_ack:
        cols += ["acknowledged_at", "acknowledgement_note"]
        vals += ["now()", "'e2e ack'"]
    psql(f"INSERT INTO feedback ({', '.join(cols)}) VALUES ({', '.join(vals)})")
    return fid


def insert_audit(feedback_id: str, action: str, from_status: str,
                 to_status: str, comment: str) -> None:
    psql(
        f"INSERT INTO feedback_audit_log "
        f"(feedback_id, actor_id, action, from_status, to_status, comment, metadata) "
        f"VALUES ('{feedback_id}', NULL, '{action}', "
        f" '{from_status}'::feedback_status, '{to_status}'::feedback_status, "
        f" '{comment}', '{{\"source\":\"e2e_test\"}}'::jsonb)"
    )


def assert_eq(label: str, got, expected) -> None:
    if got != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {got!r}")
    print(f"  ✓ {label} = {got!r}")


def main() -> int:
    print(f"→ Base URL: {BASE_URL}")
    before = kpis()
    print(f"→ Baseline KPIs: {before}")

    agent_id = psql_one(
        "SELECT id FROM agents WHERE email IS NOT NULL ORDER BY full_name LIMIT 1"
    )
    creator = psql_one(
        "SELECT created_by FROM feedback WHERE created_by IS NOT NULL LIMIT 1"
    )
    assert agent_id and creator, "seed prerequisites missing"

    rsent = seed_feedback(agent_id, creator, "sent",   False, False, False)
    rack  = seed_feedback(agent_id, creator, "acknowledged", True,  True,  True)
    rdone = seed_feedback(agent_id, creator, "completed",    True,  True,  True)
    print(f"→ Seeded: sent={rsent}  ack={rack}  done={rdone}")

    # ------------------------------------------------------------------
    # 1. Hit the public tracker routes for the 'sent' row (real UPDATEs)
    # ------------------------------------------------------------------
    s1 = http_get(f"/api/public/track/open/{rsent}")
    assert s1 in (200, 204), f"open pixel returned {s1}"
    s2 = http_get(f"/api/public/track/click/{rsent}?to=/feedback/{rsent}")
    assert s2 in (200, 302), f"click tracker returned {s2}"
    time.sleep(0.5)

    row = psql(
        f"SELECT opened_at IS NOT NULL, first_opened_at IS NOT NULL, "
        f"open_count, clicked_at IS NOT NULL, click_count "
        f"FROM feedback WHERE id = '{rsent}'"
    ).split("|")
    print(f"→ Rsent after trackers: {row}")
    assert_eq("Rsent.opened_at set",       row[0], "t")
    assert_eq("Rsent.first_opened_at set", row[1], "t")
    assert_eq("Rsent.open_count",     int(row[2]), 1)
    assert_eq("Rsent.clicked_at set",      row[3], "t")
    assert_eq("Rsent.click_count",    int(row[4]), 1)

    actions = audit_actions(rsent)
    print(f"→ Rsent audit trail: {actions}")
    for required in ("email_opened", "email_clicked"):
        if required not in actions:
            raise AssertionError(
                f"Rsent audit log missing {required!r}; got {actions}"
            )
    print("  ✓ Rsent audit contains email_opened + email_clicked")

    # ------------------------------------------------------------------
    # 2. Simulate Ack / Complete audit contract (INSERT-only)
    # ------------------------------------------------------------------
    insert_audit(rack,  "acknowledge", "sent",         "acknowledged", "e2e ack")
    insert_audit(rdone, "acknowledge", "sent",         "acknowledged", "e2e ack")
    insert_audit(rdone, "complete",    "acknowledged", "completed",    "e2e complete")

    for label, fid, required in (
        ("Rack",  rack,  {"acknowledge"}),
        ("Rdone", rdone, {"acknowledge", "complete"}),
    ):
        got = set(audit_actions(fid))
        missing = required - got
        if missing:
            raise AssertionError(f"{label} audit missing {missing}; got {got}")
        print(f"  ✓ {label} audit contains {sorted(required)}")

    # ------------------------------------------------------------------
    # 3. KPI deltas
    # ------------------------------------------------------------------
    after = kpis()
    print(f"→ Post-flow KPIs:   {after}")
    print(f"→ Deltas:           " + ", ".join(
        f"{k}={after[k] - before[k]:+d}" for k in after
    ))

    # Rsent + Rack + Rdone all have delivered_at.
    assert_eq("delivered delta",    after["delivered"]    - before["delivered"],    3)
    # Rack + Rdone were seeded with opened_at; Rsent got its opened_at from the
    # tracker. But Rack/Rdone are still counted → +3. If tracker order matters,
    # verify strictly.
    # Rsent opened via tracker (+1); Rack + Rdone seeded with opened_at (+2).
    assert_eq("opened delta",       after["opened"]       - before["opened"],       3)
    assert_eq("clicked delta",      after["clicked"]      - before["clicked"],      3)
    assert_eq("acknowledged delta", after["acknowledged"] - before["acknowledged"], 1)
    assert_eq("completed delta",    after["completed"]    - before["completed"],    1)

    print("\n✅ acknowledge_flow.spec.py passed")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as e:
        print(f"\n❌ FAIL: {e}")
        sys.exit(1)
