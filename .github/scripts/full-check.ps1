$ErrorActionPreference = "Stop"

$root = Resolve-Path "$PSScriptRoot\..\.."
Set-Location $root

Write-Host "== Backend tests =="
powershell -NoProfile -File "$PSScriptRoot\run-tests.ps1"
if ($LASTEXITCODE -ne 0) { throw "Backend tests failed." }

Write-Host "== Frontend lint =="
powershell -NoProfile -File "$PSScriptRoot\run-lint.ps1"
if ($LASTEXITCODE -ne 0) { throw "Frontend lint failed." }

Write-Host "== Frontend build =="
Push-Location "$root\frontend"
npm run build
if ($LASTEXITCODE -ne 0) { Pop-Location; throw "Frontend build failed." }
Pop-Location

Write-Host "All checks passed."
