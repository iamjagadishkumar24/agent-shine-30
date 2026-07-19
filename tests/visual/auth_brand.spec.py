"""Visual regression: verify Zenwork brand title color / weight / spacing across
Light, Dark, and System themes on every auth route.

Runs against the local dev server at http://localhost:8080.
Screenshots + a JSON assertion report are written to ./screenshots/.
"""
import asyncio
import json
import re
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"
ROUTES = [
    ("signin", "/auth?mode=signin"),
    ("signup", "/auth?mode=signup"),
    ("forgot", "/forgot-password"),
    ("reset", "/reset-password"),
    ("verify", "/verify-email"),
]
THEMES = ["light", "dark", "system"]  # system => emulated as light below
STORAGE_KEY = "signal-qms-theme"
BRAND = "Zenwork Performance Manager"

# Expected computed values.
EXPECTED_WEIGHT_MIN = 700
# Solid theme token `text-foreground` maps to CSS var --foreground.
# Light -> ~black, Dark -> ~white. We assert luminance instead of exact hex.
def luminance(rgb):
    r, g, b = [c / 255 for c in rgb]
    def f(c): return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)

def parse_rgb(s):
    m = re.match(r"rgba?\(([^)]+)\)", s)
    if not m: return None
    parts = [float(x.strip()) for x in m.group(1).split(",")[:3]]
    return tuple(int(round(p)) for p in parts)

def parse_oklch_l(s):
    """Return the L component (0..1) from an oklch(...) color string, if present."""
    m = re.match(r"oklch\(\s*([0-9.]+)", s)
    return float(m.group(1)) if m else None

def color_luminance(color_str):
    """Approximate 0..1 luminance from either rgb() or oklch(); higher = brighter."""
    rgb = parse_rgb(color_str)
    if rgb:
        return luminance(rgb)
    return parse_oklch_l(color_str)


async def measure(page, route_path, theme):
    # Set theme in localStorage then navigate.
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await page.evaluate(
        "([k,v]) => localStorage.setItem(k, JSON.stringify({mode:v, accent:'indigo', density:'comfortable'}))",
        [STORAGE_KEY, theme],
    )
    await page.emulate_media(color_scheme="light" if theme != "dark" else "dark")
    await page.goto(f"{BASE}{route_path}", wait_until="networkidle")

    locator = page.get_by_role("heading", name=BRAND).first
    await locator.wait_for(state="visible", timeout=8000)

    metrics = await locator.evaluate(
        """(el) => {
          const cs = getComputedStyle(el);
          const r = el.getBoundingClientRect();
          return {
            text: el.textContent.trim(),
            color: cs.color,
            fontWeight: cs.fontWeight,
            letterSpacing: cs.letterSpacing,
            textAlign: cs.textAlign,
            whiteSpace: cs.whiteSpace,
            fontSize: cs.fontSize,
            width: r.width,
            scrollWidth: el.scrollWidth,
            clipped: el.scrollWidth > Math.ceil(r.width) + 1,
            wrapped: el.getClientRects().length > 1,
          };
        }"""
    )
    return locator, metrics


async def run():
    report = []
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for theme in THEMES:
            ctx = await browser.new_context(viewport={"width": 1280, "height": 1800})
            page = await ctx.new_page()
            for name, path in ROUTES:
                try:
                    locator, m = await measure(page, path, theme)
                except Exception as e:
                    failures.append(f"{name}/{theme}: page load or brand not found — {e}")
                    continue

                rgb = parse_rgb(m["color"])
                lum = color_luminance(m["color"])
                weight = int(m["fontWeight"])

                expected_dark_text = theme == "dark"
                # System is emulated as light above.
                if expected_dark_text:
                    color_ok = lum is not None and lum is not None and lum > 0.80  # near-white
                else:
                    color_ok = lum is not None and lum is not None and lum < 0.35  # near-black
                weight_ok = weight >= EXPECTED_WEIGHT_MIN
                layout_ok = not m["clipped"] and not m["wrapped"]

                row = {
                    "route": name, "theme": theme, "color": m["color"], "rgb": rgb,
                    "luminance": round(lum, 3) if lum else None,
                    "weight": weight, "letterSpacing": m["letterSpacing"],
                    "textAlign": m["textAlign"], "whiteSpace": m["whiteSpace"],
                    "fontSize": m["fontSize"], "clipped": m["clipped"],
                    "wrapped": m["wrapped"],
                    "color_ok": color_ok, "weight_ok": weight_ok, "layout_ok": layout_ok,
                }
                report.append(row)
                if not (color_ok and weight_ok and layout_ok):
                    failures.append(f"{name}/{theme}: color_ok={color_ok} weight_ok={weight_ok} layout_ok={layout_ok} ({row})")

                await locator.screenshot(path=str(OUT / f"brand_{name}_{theme}.png"))
            await ctx.close()
        await browser.close()

    (OUT / "auth_brand_report.json").write_text(json.dumps(report, indent=2))
    print(f"routes checked: {len(report)}")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(" -", f)
        raise SystemExit(1)
    print("OK — brand color, weight, and spacing pass across all themes and routes.")


if __name__ == "__main__":
    asyncio.run(run())
