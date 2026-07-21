"""Visual regression for feedback email templates.

Renders each template variant to HTML (via scripts/render-email-variants.ts),
opens it in Chromium at a fixed viewport, and screenshots:
  * the full email container
  * the header row (logo + brand + tagline)
  * the footer row (branded sign-off)

Each screenshot is compared against a stored baseline PNG with a strict
per-pixel mean-delta threshold. Even if a snapshot text diff would look
superficially unchanged, a pixel-level regression in the header, footer,
or logo band will fail the test.

Baselines live under tests/e2e/screenshots/email-visual/baseline/.
Set UPDATE_EMAIL_BASELINES=1 to (re)generate baselines.
"""
import asyncio
import os
import subprocess
import sys
from pathlib import Path
from playwright.async_api import async_playwright
from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
HTML_DIR = Path("/tmp/email-visual/html")
BASE_DIR = ROOT / "tests/e2e/screenshots/email-visual/baseline"
CURR_DIR = ROOT / "tests/e2e/screenshots/email-visual/current"
DIFF_DIR = ROOT / "tests/e2e/screenshots/email-visual/diff"
for d in (BASE_DIR, CURR_DIR, DIFF_DIR):
    d.mkdir(parents=True, exist_ok=True)

VARIANTS = [
    "initial-chat-logo",
    "initial-case-logo",
    "initial-chat-nologo",
    "reminder-chat-logo",
    "reminder-case-nologo",
    "initial-case-ackdue",
]
REGIONS = ["container", "header", "footer"]

# Per-pixel mean-delta threshold. Chromium font rendering is deterministic on
# a fixed viewport, so we can be strict: any real header/footer/logo change
# lifts this well above the tolerance.
MAX_MEAN_DELTA = 0.75  # 0..255 per channel
MAX_MAX_DELTA = 40     # tolerate isolated antialias pixels
UPDATE = os.environ.get("UPDATE_EMAIL_BASELINES") == "1"


def render_variants() -> None:
    subprocess.run(
        ["bun", "run", "scripts/render-email-variants.ts", str(HTML_DIR)],
        cwd=ROOT, check=True,
    )


def compare(base: Path, curr: Path, diff: Path) -> tuple[float, int]:
    a = Image.open(base).convert("RGB")
    b = Image.open(curr).convert("RGB")
    if a.size != b.size:
        # Size change is an immediate visual regression.
        return (255.0, 255)
    d = ImageChops.difference(a, b)
    d.save(diff)
    stat = d.getextrema()  # [(min,max) per channel]
    max_delta = max(hi for _, hi in stat)
    # Mean over all pixels/channels.
    pixels = list(d.getdata())
    total = sum(sum(p) for p in pixels)
    mean_delta = total / (len(pixels) * 3)
    return (mean_delta, max_delta)


async def capture(page, html_path: Path, variant: str) -> None:
    await page.goto(f"file://{html_path}", wait_until="networkidle")
    await page.wait_for_timeout(200)  # settle images

    container = page.locator("table.container").first
    header = container.locator("> tbody > tr").nth(0).locator("td").first
    footer = container.locator("> tbody > tr").last.locator("td").first

    await container.screenshot(path=str(CURR_DIR / f"{variant}__container.png"))
    await header.screenshot(path=str(CURR_DIR / f"{variant}__header.png"))
    await footer.screenshot(path=str(CURR_DIR / f"{variant}__footer.png"))


async def run() -> int:
    render_variants()
    failures: list[str] = []
    created: list[str] = []

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx = await browser.new_context(
            viewport={"width": 1280, "height": 1800},
            device_scale_factor=1,
        )
        page = await ctx.new_page()

        for v in VARIANTS:
            html = HTML_DIR / f"{v}.html"
            assert html.exists(), f"missing rendered HTML for {v}"
            await capture(page, html, v)

            for region in REGIONS:
                fname = f"{v}__{region}.png"
                curr = CURR_DIR / fname
                base = BASE_DIR / fname
                diff = DIFF_DIR / fname

                if UPDATE or not base.exists():
                    curr.replace(base)
                    created.append(fname)
                    continue

                mean_d, max_d = compare(base, curr, diff)
                if mean_d > MAX_MEAN_DELTA or max_d > MAX_MAX_DELTA:
                    failures.append(
                        f"{fname}: mean={mean_d:.3f} max={max_d} "
                        f"(limits mean<={MAX_MEAN_DELTA} max<={MAX_MAX_DELTA}) "
                        f"— see {diff.relative_to(ROOT)}"
                    )

        await browser.close()

    if created:
        print(f"created {len(created)} baseline(s):")
        for f in created:
            print(f"  + {f}")

    if failures:
        print("\nVISUAL REGRESSIONS DETECTED:")
        for f in failures:
            print(f"  ✗ {f}")
        return 1

    print(f"\n✓ {len(VARIANTS) * len(REGIONS)} region screenshots match baseline "
          f"(mean<={MAX_MEAN_DELTA}, max<={MAX_MAX_DELTA}).")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
