"""Visual regression: verify the transparent auth logo stays centered and
unclipped across viewport widths on every auth route.

Runs against the local dev server at http://localhost:8080.
Screenshots + a JSON report are written to ./screenshots/logo/.
"""
import asyncio
import json
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots" / "logo"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"
ROUTES = [
    ("signin", "/auth?mode=signin"),
    ("signup", "/auth?mode=signup"),
    ("forgot", "/forgot-password"),
    ("reset", "/reset-password"),
    ("verify", "/verify-email"),
]
# Small phones -> tablets -> laptop. Covers narrowest realistic auth widths.
VIEWPORTS = [
    ("iphone-se", 320, 800),
    ("mobile-sm", 360, 800),
    ("mobile", 390, 844),
    ("mobile-lg", 430, 900),
    ("tablet", 768, 1024),
    ("laptop", 1280, 1800),
]

# Centering tolerance: logo center must be within N px of its parent center.
CENTER_TOLERANCE_PX = 2
# Minimum expected logo size in CSS pixels at the smallest viewport.
MIN_LOGO_SIZE = 48


async def check(page, route_name: str, path: str, vp_name: str) -> dict:
    await page.goto(f"{BASE}{path}", wait_until="domcontentloaded")
    banner = page.get_by_role("group", name="Zenwork Performance Manager")
    await banner.wait_for(state="visible", timeout=8000)
    logo = banner.locator("img[aria-hidden='true']").first
    await logo.wait_for(state="visible", timeout=4000)

    metrics = await page.evaluate(
        """() => {
          const banner = document.querySelector('[role="group"][aria-label="Zenwork Performance Manager"]');
          const img = banner?.querySelector('img[aria-hidden="true"]');
          if (!banner || !img) return null;
          const bRect = banner.getBoundingClientRect();
          const iRect = img.getBoundingClientRect();
          const cs = getComputedStyle(img);
          const bannerCenter = bRect.left + bRect.width / 2;
          const logoCenter = iRect.left + iRect.width / 2;
          return {
            viewportW: window.innerWidth,
            viewportH: window.innerHeight,
            bannerLeft: bRect.left, bannerRight: bRect.right, bannerWidth: bRect.width,
            logoLeft: iRect.left, logoRight: iRect.right, logoTop: iRect.top, logoBottom: iRect.bottom,
            logoWidth: iRect.width, logoHeight: iRect.height,
            centerDelta: Math.abs(logoCenter - bannerCenter),
            bg: cs.backgroundColor,
            clipped:
              iRect.left < 0 ||
              iRect.top < 0 ||
              iRect.right > window.innerWidth ||
              iRect.bottom > window.innerHeight ||
              iRect.left < bRect.left - 0.5 ||
              iRect.right > bRect.right + 0.5,
          };
        }"""
    )
    assert metrics, f"Brand banner or logo not found on {route_name} @ {vp_name}"

    shot = OUT / f"{route_name}-{vp_name}.png"
    await banner.screenshot(path=str(shot))

    result = {
        "route": route_name,
        "viewport": vp_name,
        **metrics,
        "screenshot": str(shot.relative_to(Path(__file__).parent)),
        "pass_centered": metrics["centerDelta"] <= CENTER_TOLERANCE_PX,
        "pass_unclipped": not metrics["clipped"],
        "pass_visible": metrics["logoWidth"] >= MIN_LOGO_SIZE
        and metrics["logoHeight"] >= MIN_LOGO_SIZE,
        "pass_transparent": metrics["bg"] in ("rgba(0, 0, 0, 0)", "transparent"),
    }
    result["pass"] = all(v for k, v in result.items() if k.startswith("pass_"))
    return result


async def main():
    results: list[dict] = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            for vp_name, w, h in VIEWPORTS:
                context = await browser.new_context(viewport={"width": w, "height": h})
                page = await context.new_page()
                for route_name, path in ROUTES:
                    try:
                        results.append(await check(page, route_name, path, vp_name))
                    except Exception as e:  # noqa: BLE001
                        results.append(
                            {"route": route_name, "viewport": vp_name, "error": str(e), "pass": False}
                        )
                await context.close()
        finally:
            await browser.close()

    report = OUT / "report.json"
    report.write_text(json.dumps(results, indent=2))

    failures = [r for r in results if not r.get("pass")]
    print(f"Checked {len(results)} route/viewport combos. Failures: {len(failures)}")
    for f in failures:
        print(" -", f.get("route"), f.get("viewport"), "->", {k: f.get(k) for k in ("centerDelta", "logoWidth", "clipped", "pass_transparent", "error")})
    assert not failures, f"Logo visual regression failed: {len(failures)} case(s). See {report}"
    print("OK — logo centered, unclipped, transparent across all auth routes/viewports.")


asyncio.run(main())
