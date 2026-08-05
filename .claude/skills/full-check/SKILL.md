---
name: full-check
description: Run the backend test suite, frontend lint, and frontend build together as a pre-commit/pre-PR gate. Use before telling the user a change is done, before opening a PR, or when asked "is this ready" / "run the checks".
---

# Full check

Before calling backend or frontend work finished, run:

```powershell
.github\scripts\full-check.ps1
```

This runs, in order, and stops at the first failure:
1. Backend tests — `pytest backend\tests` (via `.github\scripts\run-tests.ps1`)
2. Frontend lint — `npm run lint` (oxlint) in `frontend/` (via `.github\scripts\run-lint.ps1`)
3. Frontend production build — `npm run build` in `frontend/`

Requires `.venv` and `frontend\node_modules` to already exist (see the project-setup skill) — this script doesn't install anything.

There is no backend linter configured (no flake8/black in `backend\requirements.txt`), so backend Python style isn't checked automatically — review manually, or ask before adding one.

If a step fails, fix the reported failure and re-run the whole script rather than just the failing step — later steps assume earlier ones still pass.
