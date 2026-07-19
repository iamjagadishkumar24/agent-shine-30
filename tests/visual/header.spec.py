"""
Visual regression tests for the authenticated dashboard header.

Runs Playwright at 1024, 1280, 1440, 2560 widths against the local dev server
(http://localhost:8080), captures an element screenshot of the top-level
<header>, and:

  1. Asserts the header does not overflow horizontally (scrollWidth == clientWidth)
     and the document itself does not overflow.
  2. Diffs the header screenshot against a baseline in tests/visual/__baselines__/.
     If no baseline exists it is created (bootstrap run) and the case passes.
     Otherwise the mean per-pixel RGB delta must stay under DIFF_THRESHOLD.

Auth is restored from the LOVABLE_BROWSER_SUPABASE_* env vars the sandbox
injects. Run inside the sandbox with:

    python3 tests/visual/header.spec.py

Update baselines intentionally by deleting the affected file in
tests/visual/__baselines__/ and re-running.
"""
from __future__ import annotations

import asyncio
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BASELINES = ROOT / "__baselines__"
ACTUAL = ROOT / "__actual__"
DIFFS = ROOT / "__diffs__"
for d in (BASELINES, ACTUAL, DIFFS):
    d.mkdir(parents=True, exist_ok=True)

BASE_URL = os.environ.get("VRT_BASE_URL", "http://localhost:8080")
WIDTHS = [1024, 1280, 1440, 2560]
DIFF_THRESHOLD = 12.0  # mean per-channel delta (0-255); tolerant to font AA + minor hydration jitter


@dataclass
class Result:
    width: int
    overflow_header: bool
    overflow_doc: bool
    mean_diff: float | None
    bootstrapped: bool
    passed: bool


async def restore_session(context, page) -> None:
    cookies = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
    if cookies:
        parsed = json.loads(cookies)
        for c in parsed:
            c["url"] = BASE_URL
        await context.add_cookies(parsed)
    await page.goto(BASE_URL, wait_until="domcontentloaded")
    sk = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
    sj = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
    if sk and sj:
        await page.evaluate(
            f"window.localStorage.setItem({json.dumps(sk)}, {json.dumps(sj)})"
        )


def mean_pixel_diff(a: Path, b: Path) -> float:
    import numpy as np

    ia = Image.open(a).convert("RGB")
    ib = Image.open(b).convert("RGB")
    if ia.size != ib.size:
        # size mismatch is itself a regression
        return 999.0
    diff = ImageChops.difference(ia, ib)
    return float(np.asarray(diff, dtype=np.uint8).mean())



async def run_one(browser, width: int) -> Result:
    context = await browser.new_context(viewport={"width": width, "height": 900})
    page = await context.new_page()
    await restore_session(context, page)
    await page.goto(f"{BASE_URL}/dashboard", wait_until="networkidle")
    await page.wait_for_selector("header", state="visible")
    await page.wait_for_timeout(400)  # let layout settle

    info = await page.evaluate(
        """() => {
          const h = document.querySelector('header');
          return {
            sw: h.scrollWidth, cw: h.clientWidth,
            overflow: h.scrollWidth > h.clientWidth,
            docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
          };
        }"""
    )

    actual_path = ACTUAL / f"header_{width}.png"
    await page.locator("header").first.screenshot(path=str(actual_path))

    baseline_path = BASELINES / f"header_{width}.png"
    bootstrapped = False
    mean_diff: float | None = None
    if not baseline_path.exists():
        # bootstrap baseline on first run
        Image.open(actual_path).save(baseline_path)
        bootstrapped = True
    else:
        mean_diff = mean_pixel_diff(baseline_path, actual_path)
        if mean_diff > DIFF_THRESHOLD:
            # write a diff image for inspection
            ia = Image.open(baseline_path).convert("RGB")
            ib = Image.open(actual_path).convert("RGB")
            if ia.size == ib.size:
                ImageChops.difference(ia, ib).save(DIFFS / f"header_{width}.png")

    await context.close()

    layout_ok = not info["overflow"] and not info["docOverflow"]
    visual_ok = bootstrapped or (mean_diff is not None and mean_diff <= DIFF_THRESHOLD)
    return Result(
        width=width,
        overflow_header=info["overflow"],
        overflow_doc=info["docOverflow"],
        mean_diff=mean_diff,
        bootstrapped=bootstrapped,
        passed=layout_ok and visual_ok,
    )


async def main() -> int:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        results = [await run_one(browser, w) for w in WIDTHS]
        await browser.close()

    print(f"{'width':>6}  {'header':>7}  {'doc':>4}  {'meanΔ':>7}  status")
    for r in results:
        status = "PASS" if r.passed else "FAIL"
        if r.bootstrapped:
            status += " (baseline created)"
        md = "n/a" if r.mean_diff is None else f"{r.mean_diff:.2f}"
        print(
            f"{r.width:>6}  {'OVER' if r.overflow_header else 'ok':>7}  "
            f"{'OVER' if r.overflow_doc else 'ok':>4}  {md:>7}  {status}"
        )

    failed = [r for r in results if not r.passed]
    if failed:
        print(f"\n{len(failed)} breakpoint(s) failed. See {DIFFS}/", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
