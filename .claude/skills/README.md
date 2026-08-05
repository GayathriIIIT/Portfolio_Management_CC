Claude Code skills for this repo — each is a directory with a `SKILL.md` (frontmatter `name`/`description` + instructions). Claude reads `description` to decide when to load one.

Skills:
- `project-setup` — bootstrap a fresh clone (venv, npm deps, seed data, dev servers).
- `full-check` — pre-commit/pre-PR gate: backend tests + frontend lint + frontend build.
- `add-api-endpoint` — conventions for adding/changing a Flask route in `backend/app/api`.
- `financial-metrics` — invariants for the return/CAGR/XIRR logic in `backend/app/api/portfolios.py`.

These reference the scripts in `.github/scripts/` directly — keep both in sync when either changes.

The same content is mirrored in `.github/skills/` for GitHub Copilot.
