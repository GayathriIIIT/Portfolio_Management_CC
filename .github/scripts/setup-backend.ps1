$ErrorActionPreference = "Stop"

if (-Not (Test-Path -Path .\.venv)) {
    python -m venv .venv
}

. .\.venv\Scripts\Activate.ps1
pip install --upgrade pip
pip install -r backend\requirements.txt
Write-Host "Backend virtual environment created/updated and backend dependencies installed."
