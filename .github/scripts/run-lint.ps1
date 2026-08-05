$ErrorActionPreference = "Stop"

Push-Location frontend
npm run lint
Pop-Location
