$ErrorActionPreference = "Stop"

Write-Host "Starting backend in a new terminal..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd \"$(Resolve-Path backend)\"; . .\.venv\Scripts\Activate.ps1; python run.py"

Write-Host "Starting frontend in a new terminal..."
Start-Process powershell -ArgumentList "-NoExit", "-Command", "cd \"$(Resolve-Path frontend)\"; npm run dev"
