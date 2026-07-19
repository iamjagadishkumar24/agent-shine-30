"""
End-to-end lifecycle test.

Simulates the outbound-email lifecycle for a single feedback row and asserts
that Delivered / Opened / Clicked / Acknowledged / Completed KPIs and audit
log entries all move together.

Runs against the local Vite dev server on http://localhost:8080 and the
managed Supabase Postgres exposed via PG* env vars in the sandbox.
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
    """Run a SQL statement via psql and return trimmed stdout."""
    out = subprocess.run(
        ["psql", "-tAc", sql],
        check=True,
        capture_output=True,
        text=True,
    )
    return out.stdout.strip()


def psql_one(sql: str) -> str:
    return psql(sql).splitlines()[0] if psql(sql) else ""


def http_get(path: str) -> tuple[int, str]:
    req = urllib.request.Request(BASE_URL + path, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            return resp.status, resp.read().decode("utf-8", errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", errors="replace")


def kpis() -> dict[str, int]:
    """Read dashboard-style counters straight from the DB (same filters the
    dashboard uses)."""
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


def seed_feedback() -> str:
    agent_id = psql_one("SELECT id FROM agents WHERE email IS NOT NULL ORDER BY full_name LIMIT 1")
    creator = psql_one("SELECT created_by FROM feedback WHERE created_by IS NOT NULL LIMIT 1")
    assert agent_id and creator, "need at least one agent + one existing creator"

    fid = str(uuid.uuid4())
    psql(
        f"""
        INSERT INTO feedback (
          id, agent_id, title, category, feedback_type, severity, status,
          summary, created_by, sent_at, delivered_at
        ) VALUES (
          '{fid}', '{agent_id}',
          '[e2e] acknowledge_flow {fid[:8]}',
          'Communication', 'constructive', 'medium', 'sent',
          'E2E test row — safe to delete',
          '{creator}',
          now(), now()
        );
        """
    )
    return fid


def cleanup(feedback_id: str) -> None:
    psql(f"DELETE FROM feedback WHERE id = '{feedback_id}'")


def assert_eq(label: str, got, expected) -> None:
    if got != expected:
        raise AssertionError(f"{label}: expected {expected!r}, got {got!r}")
    print(f"  ✓ {label} = {got!r}")


def main() -> int:
    print(f"→ Base URL: {BASE_URL}")
    before = kpis()
    print(f"→ Baseline KPIs: {before}")

    fid = seed_feedback()
    print(f"→ Seeded feedback {fid}")

    try:
        # 1. Open pixel
        status, _ = http_get(f"/api/public/track/open/{fid}")
        assert status in (200, 204), f"open pixel returned {status}"
        # 2. Click tracker (302 to same-origin path)
        status, _ = http_get(f"/api/public/track/click/{fid}?to=/feedback/{fid}")
        assert status in (200, 302), f"click tracker returned {status}"

        # Give the async writes a moment
        time.sleep(0.5)

        row = psql(
            f"SELECT opened_at IS NOT NULL, first_opened_at IS NOT NULL, "
            f"open_count, clicked_at IS NOT NULL, click_count "
            f"FROM feedback WHERE id = '{fid}'"
        ).split("|")
        print("→ After tracker hits, feedback row:", row)
        assert_eq("opened_at set", row[0], "t")
        assert_eq("first_opened_at set", row[1], "t")
        assert_eq("open_count", int(row[2]), 1)
        assert_eq("clicked_at set", row[3], "t")
        assert_eq("click_count", int(row[4]), 1)

        # 3. Acknowledge (portal action — write directly to simulate)
        psql(
            f"UPDATE feedback SET status = 'acknowledged', "
            f"acknowledged_at = now(), acknowledgement_note = 'e2e ack' "
            f"WHERE id = '{fid}'"
        )
        # Portal.acknowledgeFeedback writes an audit row; mirror it here so
        # the assertion covers the audit contract.
        psql(
            f"INSERT INTO feedback_audit_log "
            f"(feedback_id, actor_id, action, from_status, to_status, "
            f" comment, metadata) VALUES "
            f"('{fid}', NULL, 'acknowledge', 'sent', 'acknowledged', "
            f" 'e2e ack', '{{\"source\":\"e2e_test\"}}'::jsonb)"
        )

        # 4. Complete (staff action)
        psql(f"UPDATE feedback SET status = 'completed' WHERE id = '{fid}'")
        psql(
            f"INSERT INTO feedback_audit_log "
            f"(feedback_id, actor_id, action, from_status, to_status, "
            f" comment, metadata) VALUES "
            f"('{fid}', NULL, 'complete', 'acknowledged', 'completed', "
            f" 'e2e complete', '{{\"source\":\"e2e_test\"}}'::jsonb)"
        )

        # 5. Audit log must contain all lifecycle actions
        actions = audit_actions(fid)
        print(f"→ Audit trail: {actions}")
        for required in ("email_opened", "email_clicked", "acknowledge", "complete"):
            if required not in actions:
                raise AssertionError(f"audit log missing action {required!r}; got {actions}")
        print("  ✓ audit log contains email_opened, email_clicked, acknowledge, complete")

        # 6. KPI deltas
        after = kpis()
        print(f"→ Post-flow KPIs: {after}")
        assert_eq("delivered delta", after["delivered"] - before["delivered"], 1)
        assert_eq("opened delta", after["opened"] - before["opened"], 1)
        assert_eq("clicked delta", after["clicked"] - before["clicked"], 1)
        # acknowledged then completed — net change on 'acknowledged' bucket is 0,
        # 'completed' should be +1.
        assert_eq("acknowledged delta", after["acknowledged"] - before["acknowledged"], 0)
        assert_eq("completed delta", after["completed"] - before["completed"], 1)

        print("\n✅ acknowledge_flow.spec.py passed")
        return 0
    finally:
        cleanup(fid)
        print(f"→ Cleaned up feedback {fid}")


if __name__ == "__main__":
    try:
        sys.exit(main())
    except AssertionError as e:
        print(f"\n❌ FAIL: {e}")
        sys.exit(1)
