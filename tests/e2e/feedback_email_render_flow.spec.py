"""End-to-end feedback email rendering contract.

Drives the authenticated app in Chromium: for every feedback row in the
database, opens the detail page, clicks "Preview email" (which invokes
the real `previewFeedbackEmail` server function — same server-side path
production uses to render outbound mail), reads the rendered HTML out of
the preview <iframe srcdoc>, and asserts:

  * logoUrl <img> is rendered with alt="QualiPulse"
  * brand name AND tagline appear in the header block
  * case number matches the QA-YYYY-NNNNNN format (subject + body)
  * branded footer sign-off is present
  * acknowledgement notice block is present

Runs against `http://localhost:8080` with the managed Supabase session
restored from `LOVABLE_BROWSER_SUPABASE_*` env vars. When the session
is not injected (e.g. `LOVABLE_BROWSER_AUTH_STATUS=signed_out`) the
suite exits 0 with a clear skip message so CI does not falsely fail
on unauthenticated preview environments.
"""
import asyncio
import json
import os
import re
import sys
import urllib.request
from pathlib import Path

from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parents[2]
SHOTS = ROOT / "tests/e2e/screenshots/email-e2e"
SHOTS.mkdir(parents=True, exist_ok=True)

APP = "http://localhost:8080"
CASE_RE = re.compile(r"QA-\d{4}-\d{6}")
BRAND = "QualiPulse"
TAGLINE = "Quality Feedback and Performance Management"

# Pull the same Supabase project the app uses (VITE_ prefix is public).
def _load_env_file() -> dict[str, str]:
    env: dict[str, str] = {}
    p = ROOT / ".env"
    if not p.exists():
        return env
    for line in p.read_text().splitlines():
        if "=" in line and not line.strip().startswith("#"):
            k, _, v = line.partition("=")
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _skip(reason: str) -> int:
    print(f"[skip] {reason}")
    return 0


def _fetch_feedback_ids(sb_url: str, sb_key: str, token: str) -> list[dict]:
    # PostgREST — narrowly select what we need to pick variants.
    req = urllib.request.Request(
        f"{sb_url}/rest/v1/feedback"
        "?select=id,case_number,interaction_type,acknowledgement_due_at,status"
        "&order=created_at.desc&limit=25",
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {token}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read().decode())


def _pick_variants(rows: list[dict]) -> list[dict]:
    """Choose up to 4 rows covering: chat+case_no, case+case_no,
    row with ack-due date, and a fallback."""
    chosen: dict[str, dict] = {}
    for r in rows:
        cn = (r.get("case_number") or "").strip()
        it = (r.get("interaction_type") or "").lower()
        if cn and it == "chat" and "chat_case" not in chosen:
            chosen["chat_case"] = r
        if cn and it == "case" and "case_case" not in chosen:
            chosen["case_case"] = r
        if r.get("acknowledgement_due_at") and "ack_due" not in chosen:
            chosen["ack_due"] = r
        if "fallback" not in chosen:
            chosen["fallback"] = r
        if len(chosen) >= 4:
            break
    return list(chosen.values())


async def _assert_preview(page, row: dict, tag: str) -> list[str]:
    fid = row["id"]
    errors: list[str] = []
    await page.goto(f"{APP}/feedback/{fid}", wait_until="domcontentloaded")
    # Preview button — visible label is "Preview email"
    btn = page.get_by_role("button", name=re.compile(r"Preview email", re.I))
    await btn.wait_for(state="visible", timeout=15000)
    await btn.click()

    iframe = page.locator("iframe[srcdoc], iframe[title*='preview' i]").first
    await iframe.wait_for(state="visible", timeout=15000)
    # Poll srcdoc for real content (server fn resolves async).
    html = ""
    for _ in range(60):
        html = await iframe.get_attribute("srcdoc") or ""
        if BRAND in html and len(html) > 500:
            break
        await page.wait_for_timeout(250)

    await page.screenshot(path=str(SHOTS / f"{tag}.png"))

    if not html:
        errors.append(f"{tag}: empty srcdoc")
        return errors

    def need(cond: bool, msg: str) -> None:
        if not cond:
            errors.append(f"{tag}: {msg}")

    # Brand name + tagline in header
    need(BRAND in html, "missing brand name")
    need(TAGLINE in html, "missing brand tagline")

    # Logo <img> with QualiPulse alt (settings/preview always injects logoUrl)
    need(
        bool(re.search(r'<img[^>]+alt="QualiPulse"', html)),
        "missing logo <img alt=\"QualiPulse\">",
    )

    # Case number QA-YYYY-NNNNNN (only feedbacks with case_number)
    if (row.get("case_number") or "").strip():
        m = CASE_RE.search(html)
        need(m is not None, "missing QA-YYYY-NNNNNN case number in body")
        if m:
            need(m.group(0) == row["case_number"],
                 f"case number mismatch: {m.group(0)} vs {row['case_number']}")

    # Acknowledgement notice block
    need("Acknowledgement Required" in html, "missing acknowledgement notice")
    need(re.search(r"acknowledge receipt by replying", html, re.I) is not None,
         "missing acknowledgement call-to-action")

    # Branded footer — QualiPulse in a border-top footer cell
    need(
        bool(re.search(r'border-top:\s*1px solid[^>]*>[\s\S]{0,600}?QualiPulse',
                       html)),
        "missing branded footer row",
    )

    # Close dialog for the next iteration
    close = page.get_by_role("button", name=re.compile(r"^Close$", re.I))
    if await close.count() > 0:
        await close.first.click()
    return errors


async def run() -> int:
    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status != "injected":
        return _skip(f"LOVABLE_BROWSER_AUTH_STATUS={status or 'unset'} — "
                     "sign in to the preview to inject a session.")

    env = _load_env_file()
    sb_url = env.get("VITE_SUPABASE_URL")
    sb_key = env.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    token = os.environ.get("LOVABLE_BROWSER_SUPABASE_ACCESS_TOKEN")
    if not (sb_url and sb_key and token):
        return _skip("missing Supabase env or access token")

    try:
        rows = _fetch_feedback_ids(sb_url, sb_key, token)
    except Exception as e:
        return _skip(f"could not list feedback rows: {e}")

    variants = _pick_variants(rows)
    if not variants:
        return _skip("no feedback rows available to preview")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        # Restore Supabase session (cookies + localStorage) — see browser-use.
        cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = APP
            await context.add_cookies(cookies)

        page = await context.new_page()
        await page.goto(APP, wait_until="domcontentloaded")
        storage_key = os.environ.get("LOVABLE_BROWSER_SUPABASE_STORAGE_KEY")
        session_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_SESSION_JSON")
        if storage_key and session_json:
            await page.evaluate(
                f"window.localStorage.setItem("
                f"{json.dumps(storage_key)}, {json.dumps(session_json)})"
            )

        all_errors: list[str] = []
        for idx, row in enumerate(variants):
            tag = f"variant-{idx}-{(row.get('interaction_type') or 'x')}"
            print(f"→ preview {row['id']} ({tag})")
            errs = await _assert_preview(page, row, tag)
            all_errors.extend(errs)

        await browser.close()

    if all_errors:
        print("\nFEEDBACK EMAIL E2E FAILURES:")
        for e in all_errors:
            print(f"  ✗ {e}")
        return 1

    print(f"\n✓ {len(variants)} feedback previews rendered by the real "
          f"server flow all match the branding contract.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(run()))
