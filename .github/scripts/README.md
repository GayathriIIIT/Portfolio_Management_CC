Project helper PowerShell scripts located in `.github/scripts/`.

Files:
- `setup-backend.ps1` — creates `.venv` and installs backend dependencies.
- `setup-frontend.ps1` — installs frontend `npm` dependencies.
- `start-dev.ps1` — launches backend and frontend each in a new PowerShell window.
- `activate-venv.ps1` — activates the backend `.venv`.
- `run-tests.ps1` — runs backend tests with `pytest`.
- `seed-db.ps1` — populates the database via `backend/seed_data.py` (idempotent).
- `run-lint.ps1` — runs frontend lint (`oxlint`). No backend linter is configured yet.
- `full-check.ps1` — backend tests + frontend lint + frontend build, in order. The pre-commit/pre-PR gate.

Usage (PowerShell, repo root):

```powershell
# create / update venv + install backend deps
.github\scripts\setup-backend.ps1

# install frontend deps
.github\scripts\setup-frontend.ps1

# seed the database with sample data
.github\scripts\seed-db.ps1

# start both dev servers
.github\scripts\start-dev.ps1

# run backend tests
.github\scripts\run-tests.ps1

# lint the frontend
.github\scripts\run-lint.ps1

# run everything before calling a change done
.github\scripts\full-check.ps1
```
