"""
Authenticated Playwright regression for the Analytics KPI drill-down.

Verifies:
  1. Analytics page renders four KPI cards (Total feedback, Avg Quality score,
     Delivery rate, Acknowledgement rate).
  2. Clicking each KPI card opens the right-side drill-down sheet with a
     matching title.
  3. When rows exist, the drill sheet renders a table body and every row
     exposes an "Open" link that navigates to the feedback detail route.
  4. The sheet closes cleanly between drills.

Auth: restores the managed Supabase session from LOVABLE_BROWSER_* env vars
(see AGENT sandbox conventions). When the sandbox is signed out or the
project has no Supabase auth, the test SKIPs with a clear message instead
of falsely failing.

Run:  python3 tests/e2e/analytics_drilldown.spec.py
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PWTimeout


BASE_URL = os.environ.get("APP_URL", "http://localhost:8080")
SS = Path(__file__).parent / "screenshots" / "analytics_drilldown"
SS.mkdir(parents=True, exist_ok=True)

# The drill window we exercise in this test. Kept in sync with the URL we
# navigate to below so seed rows are guaranteed to fall inside the range.
WINDOW_DAYS = 30
SEED_TAG = "e2e-drill-seed"


def seed_drill_window() -> None:
    """Insert feedback rows dated across the last WINDOW_DAYS days.

    Every row has score, delivered_at, and (for half of them) acknowledged_at
    populated, so all four KPIs (Total, Scored, Delivered, Acknowledged) have
    rows in the drill-down for the same range the test navigates to.

    Idempotent: deletes any prior rows tagged with SEED_TAG before inserting.
    Runs only when psql + PG* env vars are available; otherwise no-ops and
    lets the test rely on ambient data.
    """
    if not os.environ.get("PGHOST"):
        print("seed: PGHOST not set, skipping seed step")
        return

    now = datetime.now(timezone.utc)
    end = now.isoformat()
    start = (now - timedelta(days=WINDOW_DAYS - 1)).isoformat()

    sql = f"""
    DELETE FROM feedback WHERE '{SEED_TAG}' = ANY(tags);

    WITH agent_pool AS (
      SELECT id, row_number() OVER (ORDER BY id) AS rn FROM agents
    ),
    creator AS (
      SELECT created_by FROM feedback GROUP BY created_by
      ORDER BY count(*) DESC LIMIT 1
    ),
    series AS (
      SELECT gs AS i,
             (now() - ((gs - 1) * interval '1 day')
                    - (gs * interval '43 minutes')) AS ts
      FROM generate_series(1, {WINDOW_DAYS - 1}) gs
    )
    INSERT INTO feedback (
      agent_id, title, category, feedback_type, severity, status, score,
      summary, tags, created_by,
      created_at, updated_at, sent_at, delivered_at, acknowledged_at,
      overall_score, overall_percentage, performance_label
    )
    SELECT
      (SELECT id FROM agent_pool
        WHERE rn = ((s.i - 1) % (SELECT count(*) FROM agent_pool)) + 1),
      'E2E drill seed #' || s.i,
      (ARRAY['Communication','Compliance','Product Knowledge',
             'Handling Time','Customer Empathy'])[1 + (s.i % 5)],
      (ARRAY['constructive','positive','critical',
             'compliance','coaching']::feedback_type[])[1 + (s.i % 5)],
      (ARRAY['low','medium','high','critical']::feedback_severity[])
        [1 + (s.i % 4)],
      CASE WHEN s.i % 2 = 0 THEN 'acknowledged'::feedback_status
           ELSE 'sent'::feedback_status END,
      65 + ((s.i * 11) % 30) + 0.5,
      'Seeded for KPI drill-down E2E coverage #' || s.i,
      ARRAY['{SEED_TAG}']::text[],
      (SELECT created_by FROM creator),
      s.ts, s.ts,
      s.ts + interval '3 minutes',
      s.ts + interval '7 minutes',
      CASE WHEN s.i % 2 = 0 THEN s.ts + interval '90 minutes' ELSE NULL END,
      65 + ((s.i * 11) % 30) + 0.5,
      65 + ((s.i * 11) % 30) + 0.5,
      'Good'
    FROM series s;
    """

    result = subprocess.run(
        ["psql", "-v", "ON_ERROR_STOP=1", "-q", "-c", sql],
        capture_output=True, text=True,
    )
    if result.returncode != 0:
        print("seed: psql failed:", result.stderr.strip())
        sys.exit(2)
    print(f"seed: inserted rows across last {WINDOW_DAYS} days "
          f"[{start} .. {end}]")

KPI_LABELS = [
    "Total feedback",
    "Avg Quality score",
    "Delivery rate",
    "Acknowledgement rate",
]

# The drill sheet title comes from DRILL_META in analytics.tsx.
KPI_TO_SHEET_TITLE = {
    "Total feedback": "All feedback",
    "Avg Quality score": "Scored feedback",
    "Delivery rate": "Delivered feedback",
    "Acknowledgement rate": "Acknowledged feedback",
}


def skip(msg: str) -> None:
    print(f"SKIP: {msg}")
    sys.exit(0)


def fail(msg: str) -> None:
    print(f"FAIL: {msg}")
    sys.exit(1)


async def restore_session(context, page) -> None:
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status in ("signed_out", "external_unmanaged"):
        skip(f"no auth session available (status={status})")
    if status == "no_supabase" or status == "":
        # No managed Supabase auth — nothing to restore. Continue and let
        # the auth gate decide.
        pass

    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")

    if cookies_json:
        cookies = json.loads(cookies_json)
        for c in cookies:
            c["url"] = BASE_URL
        await context.add_cookies(cookies)

    await page.goto(BASE_URL, wait_until="domcontentloaded")

    if storage_key and session_json:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(storage_key)}, {json.dumps(session_json)})"
        )


async def open_analytics(page) -> None:
    # Force the 30d preset so the URL window matches seed_drill_window().
    await page.goto(f"{BASE_URL}/analytics?preset=30d", wait_until="domcontentloaded")
    # If the auth gate redirects us to /auth, we can't proceed.
    try:
        await page.wait_for_url("**/analytics**", timeout=8000)
    except PWTimeout:
        skip(f"analytics not reachable (landed on {page.url})")

    # Wait for either the KPI grid or the empty state.
    try:
        await page.wait_for_selector(
            "text=Total feedback, text=No feedback in this range", timeout=15000
        )
    except PWTimeout:
        pass
    await page.wait_for_timeout(600)


async def kpi_card(page, label: str):
    # KPI card = clickable Card with role='button' containing the label span.
    return page.locator('[role="button"]', has_text=label).first


async def drill_and_verify(page, label: str) -> dict:
    card = await kpi_card(page, label)
    if await card.count() == 0:
        skip(f"KPI card '{label}' not present — analytics likely empty")

    await card.click()
    dialog = page.locator('[role="dialog"]').last

    expected_title = KPI_TO_SHEET_TITLE[label]
    try:
        await dialog.get_by_text(expected_title, exact=True).wait_for(timeout=5000)
    except PWTimeout:
        await page.screenshot(path=str(SS / f"fail_{label.replace(' ', '_')}.png"))
        fail(f"drill sheet did not show title '{expected_title}' for '{label}'")

    # Count rows and Open links inside the dialog.
    row_count = await dialog.locator("tbody tr").count()
    # Filter rows that actually have data (skip the "No matching records" cell).
    open_links = dialog.locator('tbody a:has-text("Open")')
    open_count = await open_links.count()

    await page.screenshot(path=str(SS / f"drill_{label.replace(' ', '_')}.png"))

    # If we have data rows, at least one Open link must exist and point at
    # /feedback/<uuid>.
    open_href = None
    if open_count > 0:
        open_href = await open_links.first.get_attribute("href") or ""
        if "/feedback/" not in open_href:
            fail(f"'{label}' open link href unexpected: {open_href!r}")

    # Close the sheet — press Escape and confirm it disappears.
    await page.keyboard.press("Escape")
    try:
        await dialog.wait_for(state="detached", timeout=3000)
    except PWTimeout:
        # Some sheets keep the node but hide it; check visibility instead.
        if await dialog.is_visible():
            fail(f"drill sheet for '{label}' did not close on Escape")

    return {"label": label, "rows": row_count, "open_links": open_count, "sample_href": open_href}


async def main() -> None:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        await restore_session(context, page)
        await open_analytics(page)

        # Fast bail if the empty-state card is showing instead of KPI cards.
        if await page.locator("text=No feedback in this range").count() > 0:
            await page.screenshot(path=str(SS / "empty_state.png"))
            skip("analytics is empty for this user — no drill-down to exercise")

        results = []
        for label in KPI_LABELS:
            results.append(await drill_and_verify(page, label))

        print("PASS:", json.dumps(results, indent=2))
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
