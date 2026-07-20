# Accessibility tests

Automated a11y checks that fail CI on regressions. Currently covers the
authentication surface; extend the route list to grow coverage.

## What is checked

`tests/a11y/auth_routes.spec.py` loads every AuthShell route in both light
and dark themes, injects the pinned axe-core build, and runs the WCAG 2.1
A/AA + best-practice rule sets.

- `serious` and `critical` violations FAIL the run (exit 1).
- `moderate` and `minor` are reported as warnings and do not fail.
- Full violation JSON per (route, theme) is written to
  `tests/a11y/artifacts/`. On any failure, a screenshot is also captured.

Routes covered:

- `/auth`
- `/reset-password`
- `/verify-email`

`/sign-up` and `/forgot-password` are TanStack redirects to `/auth`, so
they are exercised transitively.

## Run locally

```bash
# Start the app in one shell
bun run dev

# Run the audit in another
python3 tests/a11y/auth_routes.spec.py
```

Override the target host with `BASE_URL=https://staging.example.com python3 ...`.

## Run in CI

`.github/workflows/a11y.yml` builds the app, boots the preview server,
runs the audit, and uploads `tests/a11y/artifacts/**` on failure.

## Adding a new route

Append the path to `AUTH_ROUTES` (or create a sibling spec that mirrors
the existing one) and ship the change in the same PR that introduces the
route. Screenshots and full JSON reports land in
`tests/a11y/artifacts/` for review.

## Rule tuning

- Change the standard by editing `AXE_RUN_OPTIONS.runOnly.values`
  (e.g. add `wcag22aa`).
- Suppress a known false positive by tagging the DOM node with
  `data-axe-ignore="<rule-id>"` and filtering it in the spec — do NOT
  silence rules globally.
