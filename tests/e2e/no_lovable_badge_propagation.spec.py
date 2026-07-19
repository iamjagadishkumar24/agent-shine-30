"""
E2E propagation guard: after toggling badge visibility off, hosting can take
up to ~5 minutes to fully propagate. This test polls every published route
and only fails if the 'Made with Lovable' / 'Edit with Lovable' badge is
still present after the timeout.

Run:
  python3 tests/e2e/no_lovable_badge_propagation.spec.py
Optional env:
  BASE_URL=https://agent-shine-30.lovable.app
  TIMEOUT_SECONDS=300     # total wall-clock budget (default 5 min)
  POLL_INTERVAL=15        # seconds between polls (default 15s)
"""

import asyncio
import os
import sys
import time
from pathlib import Path
from playwright.async_api import async_playwright, Page

BASE_URL = os.environ.get("BASE_URL", "https://agent-shine-30.lovable.app").rstrip("/")


def _positive_int_env(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError:
        print(f"ERROR: {name} must be a positive integer (got {raw!r}).", file=sys.stderr)
        sys.exit(2)
    if value <= 0:
        print(f"ERROR: {name} must be > 0 (got {value}).", file=sys.stderr)
        sys.exit(2)
    return value


TIMEOUT_SECONDS = _positive_int_env("TIMEOUT_SECONDS", 300)
POLL_INTERVAL = _positive_int_env("POLL_INTERVAL", 15)

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
    "a[href*='utm_source=lovable' i]",
    ".lovable-badge",
]

FORBIDDEN_TEXT = [
    "made with lovable",
    "edit with lovable",
    "built with lovable",
]

SCREENSHOTS = Path(__file__).parent / "screenshots" / "no_lovable_badge_propagation"
SCREENSHOTS.mkdir(parents=True, exist_ok=True)


async def route_has_badge(page: Page, route: str) -> list[str]:
    findings: list[str] = []
    url = f"{BASE_URL}{route}"
    try:
        await page.goto(url, wait_until="networkidle", timeout=30_000)
    except Exception as exc:
        return [f"navigation failed ({exc})"]

    # Cache-bust and let any late-injected badge script run.
    await page.wait_for_timeout(1500)

    for selector in BADGE_SELECTORS:
        try:
            if await page.locator(selector).count() > 0:
                findings.append(f"selector matched: {selector}")
        except Exception:
            pass

    try:
        body_text = (await page.inner_text("body")).lower()
        for phrase in FORBIDDEN_TEXT:
            if phrase in body_text:
                findings.append(f"text present: {phrase!r}")
    except Exception:
        pass

    return findings


async def sweep(page: Page) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for route in ROUTES:
        findings = await route_has_badge(page, route)
        if findings:
            result[route] = findings
    return result


async def main() -> int:
    deadline = time.monotonic() + TIMEOUT_SECONDS
    attempt = 0
    last_findings: dict[str, list[str]] = {}

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            # Bypass any intermediate caches while we poll.
            extra_http_headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
        )
        page = await context.new_page()

        while True:
            attempt += 1
            elapsed = int(TIMEOUT_SECONDS - max(0, deadline - time.monotonic()))
            print(f"[attempt {attempt} | t+{elapsed}s] sweeping {len(ROUTES)} routes @ {BASE_URL}")
            last_findings = await sweep(page)

            if not last_findings:
                # Snapshot each route as evidence the badge is gone.
                for route in ROUTES:
                    slug = route.strip("/").replace("/", "_") or "root"
                    try:
                        await page.goto(f"{BASE_URL}{route}", wait_until="domcontentloaded")
                        await page.screenshot(path=str(SCREENSHOTS / f"{slug}.png"))
                    except Exception:
                        pass
                await browser.close()
                print(f"\n✅ Badge fully propagated as removed after {elapsed}s "
                      f"({attempt} attempt{'s' if attempt != 1 else ''}).")
                return 0

            for route, findings in last_findings.items():
                for f in findings:
                    print(f"  still present on {route}: {f}")

            if time.monotonic() >= deadline:
                await browser.close()
                print(f"\n❌ Badge still detected after {TIMEOUT_SECONDS}s.")
                for route, findings in last_findings.items():
                    print(f"  {route}: {findings}")
                return 1

            await asyncio.sleep(POLL_INTERVAL)


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
