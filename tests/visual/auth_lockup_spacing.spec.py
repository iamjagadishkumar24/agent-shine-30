"""Visual regression: verify the Zenwork brand lockup on the auth page renders
correctly across viewports (mobile / tablet / desktop) and themes (light / dark).

Checks per (viewport × theme):
  * lockup image is visible, natural size loaded, and object-contain has no crop
  * lockup width scales within the expected clamp range for the viewport
  * bottom spacing between lockup and the next control (tabs / first input)
    falls within a sane range for the breakpoint (no crowding, no huge gap)
  * background gradient behind the lockup matches the theme
    (light: near-white; dark: near-#0b1220), sampled outside the auth card
  * the lockup itself does not sit on a solid white rectangle in dark mode
    (i.e. the image's bounding area blends with the dark background — the
    <img> should not force a light backdrop). We assert the ancestor wrapper
    has a transparent background in dark mode.

Baselines: per-combo screenshots + a JSON report under ./screenshots/.
Fails hard (exit 1) with a diff list when any assertion breaks.
"""
import asyncio
import json
import re
from pathlib import Path
from playwright.async_api import async_playwright

OUT = Path(__file__).parent / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)

BASE = "http://localhost:8080"
ROUTE = "/auth?mode=signin"
STORAGE_KEY = "signal-qms-theme"

VIEWPORTS = [
    ("mobile",  390, 844),
    ("tablet",  768, 1024),
    ("desktop", 1440, 900),
]
THEMES = ["light", "dark"]

# Expected lockup width per viewport (clamp(240px, 78%, 480px) inside card padding).
# Card max-width is ~460px on mobile/tablet, so ~78% ≈ 300–360px; desktop cap is 480px.
WIDTH_BOUNDS = {
    "mobile":  (220, 380),
    "tablet":  (240, 420),
    "desktop": (280, 500),
}

# Expected spacing (px) between the bottom of the lockup and the top of the
# next interactive control (Sign in/Sign up tabs). Comes from the Tailwind
# mb-5 / sm:mb-7 / md:mb-8 / lg:mb-10 progression (~20 / 28 / 32 / 40 px).
SPACING_BOUNDS = {
    "mobile":  (12, 36),
    "tablet":  (20, 44),
    "desktop": (24, 56),
}


def parse_rgb(s):
    m = re.match(r"rgba?\(([^)]+)\)", s)
    if not m:
        return None
    parts = [float(x.strip()) for x in m.group(1).split(",")[:3]]
    return tuple(int(round(p)) for p in parts)


async def prep(page, theme):
    await page.goto(f"{BASE}/", wait_until="domcontentloaded")
    await page.evaluate(
        "([k,v]) => localStorage.setItem(k, JSON.stringify({mode:v, accent:'indigo', density:'comfortable'}))",
        [STORAGE_KEY, theme],
    )
    await page.emulate_media(color_scheme=theme)
    await page.goto(f"{BASE}{ROUTE}", wait_until="networkidle")


async def measure(page):
    img = page.locator('img[alt="Zenwork Performance Manager"]').first
    await img.wait_for(state="visible", timeout=8000)

    # Wait for the natural image to actually finish loading.
    await page.wait_for_function(
        "(el) => el && el.complete && el.naturalWidth > 0",
        arg=await img.element_handle(),
        timeout=8000,
    )

    data = await img.evaluate(
        """(el) => {
          const rect = el.getBoundingClientRect();
          const wrapper = el.closest('[role="group"]');
          const wrect = wrapper ? wrapper.getBoundingClientRect() : rect;
          const wcs = wrapper ? getComputedStyle(wrapper) : null;
          // Find the next tab/button/input after the lockup wrapper
          const candidates = Array.from(document.querySelectorAll(
            '[role="tablist"], form input, form button'
          )).filter(n => {
            const r = n.getBoundingClientRect();
            return r.top > wrect.bottom - 1 && r.width > 0 && r.height > 0;
          });
          candidates.sort((a,b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
          const next = candidates[0];
          const nrect = next ? next.getBoundingClientRect() : null;
          return {
            imgTop: rect.top, imgBottom: rect.bottom,
            imgWidth: rect.width, imgHeight: rect.height,
            naturalWidth: el.naturalWidth, naturalHeight: el.naturalHeight,
            complete: el.complete,
            wrapperBg: wcs ? wcs.backgroundColor : null,
            wrapperBottom: wrect.bottom,
            nextTop: nrect ? nrect.top : null,
            nextTag: next ? next.tagName.toLowerCase() : null,
            nextRole: next ? (next.getAttribute('role') || '') : null,
          };
        }"""
    )

    # Background color sampled from a point OUTSIDE the auth card,
    # e.g. top-left of the viewport where the ambient gradient renders.
    bg = await page.evaluate(
        """() => {
          const el = document.elementFromPoint(20, 20);
          if (!el) return null;
          return getComputedStyle(el).backgroundColor;
        }"""
    )
    data["ambientBg"] = bg
    return img, data


async def run():
    report = []
    failures = []
    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        for vp_name, w, h in VIEWPORTS:
            for theme in THEMES:
                ctx = await browser.new_context(viewport={"width": w, "height": h})
                page = await ctx.new_page()
                try:
                    await prep(page, theme)
                    img, m = await measure(page)
                except Exception as e:
                    failures.append(f"{vp_name}/{theme}: setup failed — {e}")
                    await ctx.close()
                    continue

                # Assertions
                wmin, wmax = WIDTH_BOUNDS[vp_name]
                smin, smax = SPACING_BOUNDS[vp_name]

                width_ok = wmin <= m["imgWidth"] <= wmax
                loaded_ok = bool(m["complete"]) and m["naturalWidth"] > 0
                # Aspect ratio ≈ 3:2 (natural 1500x1000). Rendered height/width should be ~0.66.
                ratio = (m["imgHeight"] / m["imgWidth"]) if m["imgWidth"] else 0
                ratio_ok = 0.55 <= ratio <= 0.78  # allow slight variance

                spacing = None
                spacing_ok = True
                if m["nextTop"] is not None:
                    spacing = m["nextTop"] - m["imgBottom"]
                    spacing_ok = smin <= spacing <= smax
                else:
                    spacing_ok = False

                # Wrapper must be transparent so the image blends with the shell
                wrapper_bg_rgb = parse_rgb(m["wrapperBg"] or "")
                wrapper_transparent = (
                    m["wrapperBg"] in (None, "", "rgba(0, 0, 0, 0)", "transparent")
                    or (wrapper_bg_rgb and len(m["wrapperBg"]) > 0 and "rgba" in m["wrapperBg"] and m["wrapperBg"].endswith(", 0)"))
                )

                # Background theme sanity: dark => low luminance; light => high.
                amb = parse_rgb(m["ambientBg"] or "")
                if amb:
                    lum = (0.2126 * amb[0] + 0.7152 * amb[1] + 0.0722 * amb[2]) / 255
                else:
                    lum = None
                if theme == "dark":
                    theme_bg_ok = lum is not None and lum < 0.25
                else:
                    theme_bg_ok = lum is not None and lum > 0.80

                row = {
                    "viewport": vp_name, "theme": theme,
                    "imgWidth": round(m["imgWidth"], 1),
                    "imgHeight": round(m["imgHeight"], 1),
                    "ratio": round(ratio, 3),
                    "spacing": round(spacing, 1) if spacing is not None else None,
                    "nextEl": f'{m["nextTag"]}[{m["nextRole"]}]',
                    "ambientBg": m["ambientBg"],
                    "wrapperBg": m["wrapperBg"],
                    "loaded_ok": loaded_ok,
                    "width_ok": width_ok, "ratio_ok": ratio_ok,
                    "spacing_ok": spacing_ok, "theme_bg_ok": theme_bg_ok,
                    "wrapper_transparent": bool(wrapper_transparent),
                }
                report.append(row)

                ok = all([loaded_ok, width_ok, ratio_ok, spacing_ok, theme_bg_ok, wrapper_transparent])
                if not ok:
                    failures.append(f"{vp_name}/{theme}: {row}")

                # Screenshots: full auth area + tight crop of the lockup.
                await page.screenshot(path=str(OUT / f"lockup_{vp_name}_{theme}_full.png"))
                await img.screenshot(path=str(OUT / f"lockup_{vp_name}_{theme}.png"))

                await ctx.close()
        await browser.close()

    (OUT / "auth_lockup_report.json").write_text(json.dumps(report, indent=2))
    print(f"combos checked: {len(report)}")
    if failures:
        print("FAILURES:")
        for f in failures:
            print(" -", f)
        raise SystemExit(1)
    print("OK — lockup sizing, spacing, and background pass on every viewport × theme.")


if __name__ == "__main__":
    asyncio.run(run())
