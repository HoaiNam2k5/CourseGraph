$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
if (-not $env:PLAYWRIGHT_EXECUTABLE_PATH) {
  $browserCandidates = @('C:\Program Files\Google\Chrome\Application\chrome.exe', 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')
  foreach ($browserPath in $browserCandidates) { if (Test-Path -LiteralPath $browserPath) { $env:PLAYWRIGHT_EXECUTABLE_PATH = $browserPath; break } }
}
if (Get-NetTCPConnection -State Listen -LocalPort 3100 -ErrorAction SilentlyContinue) { throw 'E2E port3100 occupied; refusing to replace another process.' }
& npm.cmd run compile --silent
if ($LASTEXITCODE -ne 0) { throw 'Compile failed.' }
& node.exe dist/scripts/prepare-e2e.js
if ($LASTEXITCODE -ne 0) { throw 'E2E environment failed.' }
& node.exe --env-file=.local/e2e.env dist/scripts/import-data.js
if ($LASTEXITCODE -ne 0) { throw 'Isolated E2E import failed.' }
& node.exe --env-file=.local/e2e.env dist/scripts/create-admin.js
if ($LASTEXITCODE -ne 0) { throw 'Isolated E2E admin setup failed.' }
$testArguments = @('--env-file="' + (Join-Path $projectRoot '.local\e2e.env') + '"', '"' + (Join-Path $projectRoot 'dist\apps\api\src\server.js') + '"')
$testProcess = Start-Process -FilePath node.exe -ArgumentList $testArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $projectRoot '.local\e2e-app.log') -RedirectStandardError (Join-Path $projectRoot '.local\e2e-app-error.log') -PassThru
$testProcess.Id | Set-Content -LiteralPath (Join-Path $projectRoot '.local\e2e-app.pid')
try {
  $ready = $false
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    try { $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3100/api/health/ready' -TimeoutSec 2; if ($response.StatusCode -eq 200) { $ready = $true; break } } catch { Start-Sleep -Milliseconds 500 }
  }
  if (-not $ready) { throw 'Isolated E2E app failed readiness.' }
  if ($env:COURSEGRAPH_CDP_URL) {
    & node.exe --env-file=.local/e2e.env scripts/browser-smoke.mjs
  } else {
    & node.exe --env-file=.local/e2e.env node_modules/@playwright/test/cli.js test
  }
  if ($LASTEXITCODE -ne 0) { throw 'Playwright E2E failed. Inspect test-results and playwright-report.' }
} finally {
  if (-not $testProcess.HasExited) { $testProcess.Kill(); $testProcess.WaitForExit(5000) | Out-Null }
}
