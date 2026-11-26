$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
# Build first so a compile failure leaves the running application available.
& npm.cmd run build
if ($LASTEXITCODE -ne 0) { throw 'Build failed; the running application was not stopped.' }
# stop-local verifies the recorded process identity before stopping it.
& (Join-Path $PSScriptRoot 'stop-local.ps1')
& (Join-Path $PSScriptRoot 'start-local.ps1') -Background
$ready = $false
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/api/health/ready' -TimeoutSec 2
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'Application was started but database readiness has not passed. See .local/app-error.log.' }
Write-Output 'CourseGraph is ready at http://127.0.0.1:3000. Refresh the browser to load the new interface.'
