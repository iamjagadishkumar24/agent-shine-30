# Visual Regression: Dashboard Header

Guards the authenticated dashboard header against layout/clipping regressions
at 1024, 1280, 1440, and 2560 px widths.

## Run

```bash
python3 tests/visual/header.spec.py
```

Requires the Lovable sandbox (Playwright + Supabase session env vars) and a
running dev server at `http://localhost:8080` (override with `VRT_BASE_URL`).

The script:

1. Signs in via the injected Supabase session, navigates to `/dashboard`.
2. Asserts `header.scrollWidth === header.clientWidth` (no horizontal
   overflow) and that the document itself does not overflow.
3. Takes an element screenshot of `<header>` and diffs it against
   `tests/visual/__baselines__/header_<width>.png`. First run creates the
   baseline; later runs fail if the mean per-channel pixel delta exceeds
   `DIFF_THRESHOLD` (3.0/255).

## Layout

- `__baselines__/` — committed reference screenshots. Update intentionally by
  deleting the file and re-running.
- `__actual__/` — screenshots from the latest run (gitignored).
- `__diffs__/` — pixel diffs for failing runs (gitignored).

## Adding breakpoints

Edit `WIDTHS` in `header.spec.py` and re-run to bootstrap the new baseline.
