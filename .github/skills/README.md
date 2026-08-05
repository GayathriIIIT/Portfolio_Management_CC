Skills for GitHub Copilot (and any other agent that reads `.github/`) — each is a directory with a `SKILL.md` describing when and how to use it, mirroring `.claude/skills/`.

Skills:
- `project-setup` — bootstrap a fresh clone (venv, npm deps, seed data, dev servers).
- `full-check` — pre-commit/pre-PR gate: backend tests + frontend lint + frontend build.
- `add-api-endpoint` — conventions for adding/changing a Flask route in `backend/app/api`.
- `financial-metrics` — invariants for the return/CAGR/XIRR logic in `backend/app/api/portfolios.py`.

These reference the scripts in `.github/scripts/` directly — keep both in sync when either changes.

Copilot has no built-in "skills" auto-discovery mechanism; point it at these files from `.github/copilot-instructions.md` if you add one, or reference a specific `SKILL.md` directly in a prompt.
