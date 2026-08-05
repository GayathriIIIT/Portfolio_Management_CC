$ErrorActionPreference = "Stop"

Push-Location frontend
npm install
Write-Host "Frontend dependencies installed."
Pop-Location
