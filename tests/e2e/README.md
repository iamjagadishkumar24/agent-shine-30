# E2E lifecycle tests

`acknowledge_flow.spec.py` seeds a `feedback` row in `sent` state, hits the
public open-pixel and click-tracker routes, marks the row acknowledged and
completed, and verifies:

- `feedback` row: `opened_at`, `first_opened_at`, `open_count`, `clicked_at`,
  `click_count`, `acknowledged_at`, and final `status = completed`.
- `feedback_audit_log` contains `email_opened`, `email_clicked`, `acknowledge`,
  and `complete` entries.
- Dashboard KPI aggregates (delivered / opened / clicked / acknowledged /
  completed counters) increase after the flow.

Run with the dev server up and Supabase PG env vars set:

```
python3 tests/e2e/acknowledge_flow.spec.py
```
