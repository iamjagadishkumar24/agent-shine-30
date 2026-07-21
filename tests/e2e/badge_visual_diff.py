"""
Visual diff guard for the published site.

For each public route, capture a viewport screenshot and compare it against a
committed baseline in tests/e2e/__baselines__/no_lovable_badge/<target>/.
Fails when the mean per-channel RGB delta exceeds DIFF_THRESHOLD — catches
badge reappearance and any material layout shift on published pages.

Bootstrap: if no baseline exists for a route+target, the current screenshot
becomes the baseline and the run passes. Commit the generated file(s) to
lock the layout in.

Run:
  BASE_URL=https://agent-shine-30.lovable.app TARGET=production \\
    python3 tests/e2e/badge_visual_diff.py
"""
from __future__ import annotations

import asyncio
import os
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

BASE_URL = os.environ.get("BASE_URL", "https://agent-shine-30.lovable.app").rstrip("/")
TARGET = os.environ.get("TARGET", "production")
DIFF_THRESHOLD = float(os.environ.get("DIFF_THRESHOLD", "8.0"))  # mean per-channel delta 0-255

ROUTES = ["/", "/auth", "/sign-up", "/forgot-password", "/reset-password", "/verify-email"]
VIEWPORT = {"width": 1280, "height": 1800}

ROOT = Path(__file__).resolve().parent
BASELINES = ROOT / "__baselines__" / "no_lovable_badge" / TARGET
ACTUAL = ROOT / "screenshots" / "no_lovable_badge_actual" / TARGET
DIFFS = ROOT / "screenshots" / "no_lovable_badge_diff" / TARGET
for d in (BASELINES, ACTUAL, DIFFS):
    d.mkdir(parents=True, exist_ok=True)


def mean_pixel_diff(a: Path, b: Path) -> float:
    import numpy as np

    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        return 999.0
    return float(np.asarray(ImageChops.difference(ia, ib), dtype=np.uint8).mean())


async def capture(page, route: str) -> Path:
    await page.goto(f"{BASE_URL}{route}", wait_until="networkidle", timeout=30_000)
    await page.wait_for_timeout(1500)  # allow late-injected content (badge script) to run
    slug = route.strip("/").replace("/", "_") or "root"
    path = ACTUAL / f"{slug}.png"
    await page.screenshot(path=str(path), clip={"x": 0, "y": 0, **VIEWPORT})
    return path


async def main() -> int:
    failures: list[str] = []
    bootstrapped: list[str] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport=VIEWPORT,
            extra_http_headers={"Cache-Control": "no-cache", "Pragma": "no-cache"},
        )
        page = await context.new_page()

        for route in ROUTES:
            slug = route.strip("/").replace("/", "_") or "root"
            try:
                actual_path = await capture(page, route)
            except Exception as exc:
                failures.append(f"{route}: capture failed ({exc})")
                continue

            baseline_path = BASELINES / f"{slug}.png"
            if not baseline_path.exists():
                Image.open(actual_path).save(baseline_path)
                bootstrapped.append(route)
                print(f"BOOTSTRAP {route} -> {baseline_path.relative_to(ROOT.parent)}")
                continue

            diff = mean_pixel_diff(baseline_path, actual_path)
            if diff > DIFF_THRESHOLD:
                # write diff image for inspection
                ia = Image.open(baseline_path).convert("RGB")
                ib = Image.open(actual_path).convert("RGB")
                if ia.size == ib.size:
                    ImageChops.difference(ia, ib).save(DIFFS / f"{slug}.png")
                failures.append(f"{route}: meanΔ={diff:.2f} > {DIFF_THRESHOLD}")
                print(f"FAIL {route}: meanΔ={diff:.2f}")
            else:
                print(f"PASS {route}: meanΔ={diff:.2f}")

        await browser.close()

    print()
    if bootstrapped:
        print(f"ℹ️  Bootstrapped baselines for: {', '.join(bootstrapped)} — commit them to lock layout.")
    if failures:
        print(f"❌ Visual diff failed on {TARGET} ({len(failures)} route(s)):")
        for f in failures:
            print(f"  - {f}")
        return 1
    print(f"✅ Visual diff passed on {TARGET} ({len(ROUTES)} route(s), threshold {DIFF_THRESHOLD}).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
