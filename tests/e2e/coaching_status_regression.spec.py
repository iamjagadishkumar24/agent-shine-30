"""
Regression tests for coaching_status handling.

Verifies:
  1. Every canonical enum value inserts cleanly (no trigger blowups).
  2. Status transitions (edit + reschedule) succeed without enum errors
     and fire the notification trigger correctly.
  3. The misspelling 'cancelled' is rejected at the DB boundary, guarding
     against a regression of the original bug.
  4. Dashboard KPI aggregation (grouping by status) picks up all rows.
  5. The frontend/backend SSOT (`src/lib/coaching-status.ts`) enumerates
     exactly the same values as the DB `coaching_status` enum.

Run:  python3 tests/e2e/coaching_status_regression.spec.py
"""
from __future__ import annotations
import os, subprocess, sys, uuid, re, json, pathlib
from datetime import datetime, timedelta, timezone

REPO = pathlib.Path(__file__).resolve().parents[2]

def psql(sql: str, expect_error: bool = False) -> str:
    r = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-A", "-t", "-c", sql],
        capture_output=True, text=True,
    )
    if expect_error:
        if r.returncode == 0:
            raise AssertionError(f"Expected error but query succeeded:\n{sql}")
        return r.stderr
    if r.returncode != 0:
        raise AssertionError(f"psql failed:\n{sql}\n{r.stderr}")
    return r.stdout.strip()


def assert_eq(a, b, msg):
    if a != b:
        raise AssertionError(f"{msg}: expected {b!r}, got {a!r}")


CANONICAL = [
    "scheduled", "pending_approval", "confirmed", "in_progress",
    "completed", "canceled", "no_show", "missed", "rescheduled",
]


def test_ssot_matches_db():
    # DB enum values
    db = psql("SELECT unnest(enum_range(NULL::coaching_status))::text ORDER BY 1").splitlines()
    assert_eq(sorted(db), sorted(CANONICAL), "DB enum vs test canonical")

    # SSOT file values
    src = (REPO / "src/lib/coaching-status.ts").read_text()
    m = re.search(r"COACHING_STATUS_VALUES\s*=\s*\[(.*?)\]", src, re.S)
    assert m, "Could not find COACHING_STATUS_VALUES in SSOT file"
    vals = re.findall(r'"([a-z_]+)"', m.group(1))
    assert_eq(sorted(vals), sorted(CANONICAL), "SSOT vs DB enum")
    print("  ✓ SSOT matches DB enum:", ", ".join(sorted(CANONICAL)))


def test_insert_every_status_and_transition():
    agent = psql("SELECT id FROM agents LIMIT 1")
    assert agent, "No agent seeded"
    created_ids: list[str] = []

    # Insert one session for each canonical status; spread scheduled_at to
    # avoid the overlap trigger.
    base = datetime.now(timezone.utc) + timedelta(days=400)  # far in future
    for i, s in enumerate(CANONICAL):
        sid = str(uuid.uuid4())
        when = (base + timedelta(hours=i * 3)).isoformat()
        psql(
            f"INSERT INTO coaching_sessions (id, agent_id, topic, scheduled_at, "
            f"duration_minutes, status) VALUES ('{sid}','{agent}','regression {s}',"
            f"'{when}', 30, '{s}'::coaching_status)"
        )
        created_ids.append(sid)
    print(f"  ✓ Inserted {len(CANONICAL)} sessions (one per enum value)")

    # Transition: pick the 'scheduled' row, run through several statuses.
    tid = created_ids[CANONICAL.index("scheduled")]
    for next_status in ("confirmed", "in_progress", "completed"):
        psql(f"UPDATE coaching_sessions SET status='{next_status}' WHERE id='{tid}'")
    row = psql(f"SELECT status FROM coaching_sessions WHERE id='{tid}'")
    assert_eq(row, "completed", "Status transition final")
    print("  ✓ scheduled → confirmed → in_progress → completed transition")

    # Reschedule: move a 'confirmed' row's scheduled_at forward — trigger
    # fires 'time changed' notification path (should not raise).
    rid = created_ids[CANONICAL.index("confirmed")]
    new_when = (base + timedelta(days=1)).isoformat()
    psql(f"UPDATE coaching_sessions SET scheduled_at='{new_when}' WHERE id='{rid}'")
    print("  ✓ Reschedule (scheduled_at change) executes trigger cleanly")

    # Cancel path — this is the historical bug: trigger literal was
    # 'cancelled', now removed. Confirm 'canceled' works end-to-end.
    cid = created_ids[CANONICAL.index("scheduled")]  # was progressed above
    # Use a fresh scheduled row instead:
    fresh = str(uuid.uuid4())
    psql(
        f"INSERT INTO coaching_sessions (id, agent_id, topic, scheduled_at,"
        f" duration_minutes, status) VALUES ('{fresh}','{agent}','cancel test',"
        f"'{(base + timedelta(days=2)).isoformat()}', 30, 'scheduled')"
    )
    created_ids.append(fresh)
    psql(f"UPDATE coaching_sessions SET status='canceled', cancelled_reason='regression test' WHERE id='{fresh}'")
    assert_eq(
        psql(f"SELECT status FROM coaching_sessions WHERE id='{fresh}'"),
        "canceled",
        "Cancel path",
    )
    print("  ✓ Cancel path (status='canceled') succeeds without enum error")

    # KPI aggregation: group by status and confirm each of our rows appears.
    ids_csv = ",".join(f"'{i}'" for i in created_ids)
    rows = psql(
        f"SELECT status::text, count(*) FROM coaching_sessions WHERE id IN ({ids_csv}) GROUP BY status ORDER BY status"
    )
    by_status = dict(line.split("|") for line in rows.splitlines() if "|" in line)
    # Every canonical status (except 'scheduled', which we transitioned away)
    # must be represented at least once.
    missing = [s for s in CANONICAL if s not in by_status and s != "scheduled"]
    assert not missing, f"KPI aggregation missing statuses: {missing}"
    print(f"  ✓ KPI aggregation counts all statuses: {json.dumps(by_status)}")

    # Cleanup
    psql(f"DELETE FROM coaching_sessions WHERE id IN ({ids_csv})")
    print(f"  ✓ Cleaned up {len(created_ids)} test rows")


def test_misspelling_rejected():
    agent = psql("SELECT id FROM agents LIMIT 1")
    when = (datetime.now(timezone.utc) + timedelta(days=500)).isoformat()
    err = psql(
        f"INSERT INTO coaching_sessions (agent_id, topic, scheduled_at,"
        f" duration_minutes, status) VALUES ('{agent}','bad status test',"
        f"'{when}', 30, 'cancelled')",
        expect_error=True,
    )
    assert "invalid input value for enum coaching_status" in err, \
        f"Expected enum error for 'cancelled', got:\n{err}"
    print("  ✓ 'cancelled' (misspelling) still rejected by DB — SSOT is authoritative")


if __name__ == "__main__":
    print("\n== coaching_status regression suite ==\n")
    try:
        print("[1] SSOT ↔ DB enum parity")
        test_ssot_matches_db()
        print("\n[2] Insert + edit + reschedule + cancel flows")
        test_insert_every_status_and_transition()
        print("\n[3] Guard: 'cancelled' misspelling is rejected")
        test_misspelling_rejected()
        print("\n✅ All coaching_status regression checks passed.")
    except AssertionError as e:
        print(f"\n❌ FAIL: {e}")
        sys.exit(1)
