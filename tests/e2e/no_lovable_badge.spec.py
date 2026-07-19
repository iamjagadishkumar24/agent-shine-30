"""
E2E guard: the 'Made with Lovable' / 'Edit with Lovable' badge must never
appear on any published route.

The badge is injected by Lovable's hosting layer on published deployments
(disabled via publish_settings). This test walks every top-level public
route on the published site and asserts:
  1. No element with id/class/data-attribute matching the badge selectors.
  2. No visible text containing 'Made with Lovable' or 'Edit with Lovable'.
  3. No <a> element linking to lovable.dev / lovable.app referral URLs.

Run:
  python3 tests/e2e/no_lovable_badge.spec.py
Optionally override the base URL:
  BASE_URL=https://agent-shine-30.lovable.app python3 tests/e2e/no_lovable_badge.spec.py
"""

import asyncio
import os
import sys
from pathlib import Path
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "https://agent-shine-30.lovable.app").rstrip("/")

# Public routes that render without auth. Authenticated routes redirect to
# /auth, which is itself covered here, so the badge check still applies.
ROUTES = [
    "/",
    "/auth",
    "/sign-up",
    "/forgot-password",
    "/reset-password",
    "/verify-email",
]

BADGE_SELECTORS = [
    "#lovable-badge",
    "[data-lovable-badge]",
    "[data-testid='lovable-badge']",
    "a[href*='lovable.dev']",
    "a[href*='lovable.app/?' i]",
    "a[href*='utm_source=lovable' i]",
    ".lovable-badge",
]

FORBIDDEN_TEXT = [
    "made with lovable",
    "edit with lovable",
    "built with lovable",
]

SCREENSHOTS = Path(__file__).parent / "screenshots" / "no_lovable_badge"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def check_route(page, route: str) -> list[str]:
    failures: list[str] = []
    url = f"{BASE_URL}{route}"
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
    except Exception as exc:
        return [f"{route}: navigation failed ({exc})"]

    # Give any late-injected badge script a moment to run.
    await page.wait_for_timeout(1500)

    for selector in BADGE_SELECTORS:
        try:
            count = await page.locator(selector).count()
        except Exception:
            count = 0
        if count > 0:
            failures.append(f"{route}: found {count} element(s) matching {selector!r}")

    body_text = (await page.inner_text("body")).lower()
    for phrase in FORBIDDEN_TEXT:
        if phrase in body_text:
            failures.append(f"{route}: page text contains {phrase!r}")

    slug = route.strip("/").replace("/", "_") or "root"
    await page.screenshot(path=str(SCREENSHOTS / f"{slug}.png"))
    return failures


async def main() -> int:
    all_failures: list[str] = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()

        for route in ROUTES:
            failures = await check_route(page, route)
            if failures:
                all_failures.extend(failures)
                for f in failures:
                    print(f"FAIL {f}")
            else:
                print(f"PASS {route}")

        await browser.close()

    print()
    if all_failures:
        print(f"❌ Badge guard failed with {len(all_failures)} issue(s)")
        return 1
    print(f"✅ Badge guard passed on {len(ROUTES)} route(s) at {BASE_URL}")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
