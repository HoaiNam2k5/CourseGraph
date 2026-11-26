param([switch]$Build, [switch]$Background)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Missing .env. Follow docs/setup.md.' }
if ($Build) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Application build failed.' }
}
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'apps\web\dist\index.html'))) { throw 'Missing web build. Run npm run build first.' }
if (-not (Get-NetTCPConnection -State Listen -LocalPort 17687 -ErrorAction SilentlyContinue)) { & (Join-Path $PSScriptRoot 'setup-neo4j.ps1') -Start }
if ($Background) {
  if (Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue) { throw 'Port 3000 already in use. Verify the existing app before starting another process.' }
  $runtimeBase = Join-Path $projectRoot '.local'
  New-Item -ItemType Directory -Force -Path $runtimeBase | Out-Null
  $appArguments = @('--env-file="' + (Join-Path $projectRoot '.env') + '"', '"' + (Join-Path $projectRoot 'dist\apps\api\src\server.js') + '"')
  $proc = Start-Process -FilePath 'node.exe' -ArgumentList $appArguments -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeBase 'app.log') -RedirectStandardError (Join-Path $runtimeBase 'app-error.log') -PassThru
  $proc.Id | Set-Content -LiteralPath (Join-Path $runtimeBase 'app.pid')
  Write-Output "CourseGraph started in background (PID $($proc.Id)); visit http://127.0.0.1:3000 once readiness is OK."
} else {
  & node.exe --env-file=.env dist/apps/api/src/server.js
}
