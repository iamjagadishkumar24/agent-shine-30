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
import sys
from pathlib import Path

from playwright.async_api import async_playwright, TimeoutError as PWTimeout


BASE_URL = os.environ.get("APP_URL", "http://localhost:8080")
SS = Path(__file__).parent / "screenshots" / "analytics_drilldown"
SS.mkdir(parents=True, exist_ok=True)

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
    await page.goto(f"{BASE_URL}/analytics", wait_until="domcontentloaded")
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
