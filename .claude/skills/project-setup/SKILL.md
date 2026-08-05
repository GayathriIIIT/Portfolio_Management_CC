---
name: project-setup
description: Bootstrap a fresh clone of this repo — backend venv, frontend deps, seed data, and dev servers. Use when asked to set up, onboard, or get the project running for the first time, or after pulling changes that touch dependencies.
---

# Project setup

This repo is a Flask backend (`backend/`) + Vite/React frontend (`frontend/`). Bootstrap and run both from PowerShell, repo root, in this order:

1. `.github\scripts\setup-backend.ps1` — creates the Python venv and installs `backend\requirements.txt`.
2. `.github\scripts\setup-frontend.ps1` — runs `npm install` in `frontend/`.
3. (optional) `.github\scripts\seed-db.ps1` — populates every table via `backend\seed_data.py`. Idempotent — safe to re-run. Requires `backend\.env` to point at a real MySQL database (see `backend\.env.example`).
4. `.github\scripts\start-dev.ps1` — opens two new PowerShell windows: backend (`python run.py`) and frontend (`npm run dev`).

Individual pieces:
- Activate the backend venv alone with `.github\scripts\activate-venv.ps1`.
- Run backend tests alone with `.github\scripts\run-tests.ps1`, or the full gate with `.github\scripts\full-check.ps1` (see the full-check skill).

Don't hand-roll `python -m venv` or `npm install` — go through these scripts so the venv location and dependency versions stay consistent with what the other scripts expect.
