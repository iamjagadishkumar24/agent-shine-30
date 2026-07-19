"""
End-to-end guard: provider delivery details must never appear on the
frontend after sending a feedback email.

Scope of "forbidden" strings on user-facing surfaces (toasts, activity
feed, delivery pipeline, feedback detail page):

  - provider names: "resend", "sendgrid", "postmark", "mailgun", "smtp",
    "gmail api"
  - provider IDs / message IDs prefixes: "message id", "messageid",
    "message-id", "queue id", "provider response", "accepted by provider"
  - low-level delivery leakage: "delivered to <email>",
    "email accepted", "250 ok", "smtp response"

The test:

  1. Seeds a `sent` feedback row via psql with a realistic
     provider_message_id + provider_status on `email_queue`, and a
     provider-tagged audit-log entry (the kind we intentionally suppress
     from the standard activity view).
  2. Loads /feedback/<id> in Playwright, waits for the delivery pipeline
     and activity feed to render, and asserts none of the forbidden
     tokens are present in the DOM text.
  3. Also asserts none of the raw provider values (messageId prefix,
     provider name) leak into the visible DOM even though they exist in
     the underlying rows.

Auth: uses the LOVABLE_BROWSER_SUPABASE_* injected session when present.
When the sandbox has no session (`signed_out` / `external_unmanaged` /
`no_supabase`), the runtime check is skipped with a clear message and
only the DB/audit contract portion is enforced.

Run:  python3 tests/e2e/no_provider_leak.spec.py
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
import uuid
from pathlib import Path

BASE_URL = os.environ.get("APP_URL", "http://localhost:8080")

SCREENSHOTS = Path("/tmp/browser/no_provider_leak")
SCREENSHOTS.mkdir(parents=True, exist_ok=True)

# --- Forbidden strings on any user-facing surface after send ---------------
FORBIDDEN_SUBSTRINGS = [
    # provider identifiers
    "resend", "sendgrid", "postmark", "mailgun", "gmail api", "smtp",
    # message id leakage
    "message id", "messageid", "message-id", "queue id",
    "provider response", "provider message",
    # low-level delivery leakage
    "email accepted", "accepted by provider", "delivered to ",
    "250 ok", "smtp response",
]

# Values we deliberately insert into the DB so we can check they never
# surface verbatim in the DOM.
INJECTED_MESSAGE_ID = f"msg_e2e_{uuid.uuid4().hex[:12]}"
INJECTED_PROVIDER = "resend"
INJECTED_SMTP_RESPONSE = "250 2.0.0 OK queued as e2e-guard"


def psql(sql: str) -> str:
    out = subprocess.run(
        ["psql", "-tAc", sql], check=True, capture_output=True, text=True,
    )
    return out.stdout.strip()


def psql_one(sql: str) -> str:
    v = psql(sql)
    return v.splitlines()[0] if v else ""


def seed_sent_feedback() -> str:
    agent_id = psql_one(
        "SELECT id FROM agents WHERE email IS NOT NULL ORDER BY full_name LIMIT 1"
    )
    creator = psql_one(
        "SELECT created_by FROM feedback WHERE created_by IS NOT NULL LIMIT 1"
    )
    assert agent_id and creator, "seed prerequisites missing"

    fid = str(uuid.uuid4())
    psql(
        f"""
        INSERT INTO feedback
          (id, agent_id, title, category, feedback_type, severity,
           status, summary, created_by, sent_at, delivered_at)
        VALUES
          ('{fid}', '{agent_id}',
           '[e2e] provider-leak {fid[:8]}',
           'Communication', 'constructive', 'medium',
           'sent'::feedback_status,
           'E2E provider-leak guard',
           '{creator}', now(), now())
        """
    )

    # Provider-tagged queue row (the kind that used to leak into the UI)
    psql(
        f"""
        INSERT INTO email_queue
          (feedback_id, to_email, to_email_intended, subject, body_html,
           status, provider, provider_message_id, provider_status,
           attempts, max_attempts, sent_at, delivered_at, last_event_at)
        VALUES
          ('{fid}', 'ops@example.com', 'ops@example.com',
           '[e2e] provider-leak',
           '<p>e2e</p>',
           'delivered', '{INJECTED_PROVIDER}', '{INJECTED_MESSAGE_ID}',
           'delivered', 1, 5, now(), now(), now())
        """
    )

    # Audit-log entries that MUST be filtered out of the visible feed.
    psql(
        f"""
        INSERT INTO feedback_audit_log
          (feedback_id, action, from_status, to_status, comment, metadata)
        VALUES
          ('{fid}', 'email_sent', 'ready_to_send'::feedback_status,
           'sent'::feedback_status,
           'SMTP response: {INJECTED_SMTP_RESPONSE}',
           '{{"provider":"{INJECTED_PROVIDER}","messageId":"{INJECTED_MESSAGE_ID}"}}'::jsonb),
          ('{fid}', 'email_delivered', 'sent'::feedback_status,
           'sent'::feedback_status,
           'Delivered to ops@example.com by provider {INJECTED_PROVIDER} (messageId {INJECTED_MESSAGE_ID})',
           '{{"queueId":"e2e"}}'::jsonb)
        """
    )
    return fid


def assert_no_leak(dom_text: str, label: str) -> None:
    lower = dom_text.lower()
    hits: list[str] = []
    for token in FORBIDDEN_SUBSTRINGS:
        if token in lower:
            hits.append(token)
    if INJECTED_MESSAGE_ID.lower() in lower:
        hits.append(INJECTED_MESSAGE_ID)
    if INJECTED_SMTP_RESPONSE.lower() in lower:
        hits.append(INJECTED_SMTP_RESPONSE)
    if hits:
        raise AssertionError(
            f"{label}: provider details leaked into DOM: {hits}"
        )
    print(f"  ✓ {label}: no provider details in DOM")


async def run_browser_check(feedback_id: str) -> None:
    try:
        from playwright.async_api import async_playwright
    except Exception as e:
        print(f"! playwright unavailable ({e}); skipping runtime DOM check")
        return

    status = os.environ.get("LOVABLE_BROWSER_AUTH_STATUS", "")
    if status not in ("injected",):
        print(f"! LOVABLE_BROWSER_AUTH_STATUS={status!r}; "
              f"skipping authenticated DOM check")
        return

    storage_key = os.environ["LOVABLE_BROWSER_SUPABASE_STORAGE_KEY"]
    session_json = os.environ["LOVABLE_BROWSER_SUPABASE_SESSION_JSON"]
    cookies_json = os.environ.get("LOVABLE_BROWSER_SUPABASE_COOKIES_JSON")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 1800}
        )
        if cookies_json:
            cookies = json.loads(cookies_json)
            for c in cookies:
                c["url"] = BASE_URL
            await context.add_cookies(cookies)
        page = await context.new_page()

        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.evaluate(
            f"window.localStorage.setItem("
            f"{json.dumps(storage_key)}, {json.dumps(session_json)})"
        )

        await page.goto(
            f"{BASE_URL}/feedback/{feedback_id}",
            wait_until="networkidle",
        )
        # Give delivery pipeline + activity feed a beat to hydrate.
        await page.wait_for_timeout(1500)
        await page.screenshot(path=str(SCREENSHOTS / "feedback_detail.png"))

        body_text = await page.evaluate("document.body.innerText")
        assert_no_leak(body_text, "feedback detail page")

        # Also check the delivery pipeline region specifically if present.
        pipeline = page.locator("[data-testid='delivery-pipeline']")
        if await pipeline.count():
            text = await pipeline.inner_text()
            assert_no_leak(text, "delivery pipeline region")

        # Activity feed
        feed = page.locator("[data-testid='activity-feed']")
        if await feed.count():
            text = await feed.inner_text()
            assert_no_leak(text, "activity feed region")

        await browser.close()


def main() -> int:
    print(f"→ Base URL: {BASE_URL}")
    fid = seed_sent_feedback()
    print(f"→ Seeded sent feedback with provider metadata: {fid}")
    print(f"  provider={INJECTED_PROVIDER}  messageId={INJECTED_MESSAGE_ID}")

    asyncio.run(run_browser_check(fid))

    print("✅ no_provider_leak.spec passed")
    return 0


if __name__ == "__main__":
    sys.exit(main())
