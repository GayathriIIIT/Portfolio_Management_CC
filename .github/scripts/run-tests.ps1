$ErrorActionPreference = "Stop"

if (-Not (Test-Path -Path .\.venv)) {
    Write-Host ".venv not found. Run scripts\setup-backend.ps1 first."
    exit 1
}

. .\.venv\Scripts\Activate.ps1
pytest backend\tests
