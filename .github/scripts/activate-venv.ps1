$ErrorActionPreference = "Stop"

if (-Not (Test-Path -Path .\.venv)) {
    Write-Host ".venv not found. Run scripts\setup-backend.ps1 first to create the environment."
    exit 1
}

. .\.venv\Scripts\Activate.ps1
Write-Host "Activated backend virtual environment."
