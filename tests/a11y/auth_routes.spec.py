"""Automated accessibility checks for all authentication routes.

Runs axe-core (WCAG 2.1 A/AA + best-practice) against every auth surface in
both light and dark themes. Fails the build if any serious/critical violation
is found. Minor/moderate violations are surfaced as warnings.

Wire into CI as:
    python3 tests/a11y/auth_routes.spec.py

Assumes the app is reachable at BASE_URL (defaults to http://localhost:8080).
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "http://localhost:8080")
ARTIFACTS = Path(__file__).parent / "artifacts"
ARTIFACTS.mkdir(exist_ok=True)

# Every route that renders AuthShell (sign-up/forgot redirect to /auth).
AUTH_ROUTES = ["/auth", "/reset-password", "/verify-email"]
THEMES = ("light", "dark")

# axe-core UMD build, pinned. Cached under /tmp on repeat runs.
AXE_URL = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js"
AXE_CACHE = Path("/tmp/axe-core-4.10.2.min.js")

# WCAG 2.1 A/AA + best practices. Extend here if the org standard changes.
AXE_RUN_OPTIONS = {
    "runOnly": {
        "type": "tag",
        "values": ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"],
    },
    "resultTypes": ["violations"],
}

# Impacts that fail the run. Anything else is a warning.
FAIL_IMPACTS = {"serious", "critical"}


def load_axe_source() -> str:
    if not AXE_CACHE.exists():
        with urllib.request.urlopen(AXE_URL, timeout=30) as r:
            AXE_CACHE.write_bytes(r.read())
    return AXE_CACHE.read_text()


async def run_axe(page, route: str, theme: str, axe_src: str):
    await page.add_script_tag(content=axe_src)
    result = await page.evaluate(
        "async (opts) => await window.axe.run(document, opts)",
        AXE_RUN_OPTIONS,
    )
    violations = result.get("violations", [])
    slug = f"{route.strip('/').replace('/', '_') or 'root'}__{theme}"
    (ARTIFACTS / f"{slug}.json").write_text(json.dumps(violations, indent=2))
    return violations


def format_violation(v: dict) -> str:
    nodes = v.get("nodes", [])
    sample_target = nodes[0].get("target", []) if nodes else []
    return (
        f"    - [{v['impact']}] {v['id']}: {v['help']} "
        f"({len(nodes)} node{'s' if len(nodes) != 1 else ''}) "
        f"first target={sample_target} -> {v['helpUrl']}"
    )


async def main() -> int:
    axe_src = load_axe_source()
    total_failures = 0
    total_warnings = 0
    report_lines: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        try:
            for route in AUTH_ROUTES:
                for theme in THEMES:
                    ctx = await browser.new_context(
                        viewport={"width": 1280, "height": 1800},
                        color_scheme=theme,
                    )
                    page = await ctx.new_page()
                    label = f"{route} [{theme}]"
                    try:
                        await page.goto(
                            f"{BASE_URL}{route}", wait_until="networkidle", timeout=30_000
                        )
                        # Wait for the auth shell so we don't scan a blank shell.
                        await page.locator(
                            'img[alt="QualiPulse"]'
                        ).wait_for(state="visible", timeout=10_000)
                        violations = await run_axe(page, route, theme, axe_src)
                    except Exception as exc:  # network, nav, wait timeout
                        report_lines.append(f"  {label}: ERROR — {exc}")
                        total_failures += 1
                        await ctx.close()
                        continue

                    failing = [v for v in violations if v.get("impact") in FAIL_IMPACTS]
                    warning = [v for v in violations if v.get("impact") not in FAIL_IMPACTS]
                    total_failures += len(failing)
                    total_warnings += len(warning)

                    status = "PASS" if not failing else "FAIL"
                    report_lines.append(
                        f"  {label}: {status} — {len(failing)} blocking, {len(warning)} warning"
                    )
                    for v in failing:
                        report_lines.append(format_violation(v))
                    for v in warning:
                        report_lines.append(format_violation(v))

                    # Screenshot for the CI artifact bundle on failure.
                    if failing:
                        shot = ARTIFACTS / f"{route.strip('/').replace('/', '_') or 'root'}__{theme}.png"
                        await page.screenshot(path=str(shot))

                    await ctx.close()
        finally:
            await browser.close()

    print("Auth a11y audit")
    print("=" * 60)
    print("\n".join(report_lines))
    print("=" * 60)
    print(
        f"Total blocking violations: {total_failures}"
        f"  |  warnings: {total_warnings}"
    )
    print(f"Artifacts: {ARTIFACTS}")
    if total_failures:
        print("RESULT: FAIL")
        return 1
    print("RESULT: PASS")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
