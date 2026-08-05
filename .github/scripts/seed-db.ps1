$ErrorActionPreference = "Stop"

if (-Not (Test-Path -Path .\.venv)) {
    Write-Host ".venv not found. Run .github\scripts\setup-backend.ps1 first."
    exit 1
}

. .\.venv\Scripts\Activate.ps1
python backend\seed_data.py
Write-Host "Database seeded."
