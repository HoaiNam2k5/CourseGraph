$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
& npm.cmd ci
if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
& npm.cmd run setup:env
if ($LASTEXITCODE -ne 0) { throw 'Environment initialization failed.' }
& (Join-Path $PSScriptRoot 'setup-neo4j.ps1') -Start
$ready = $false
for ($attempt = 0; $attempt -lt 40; $attempt++) {
  try {
    $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:17474/' -TimeoutSec 2
    if ($response.StatusCode -eq 200) { $ready = $true; break }
  } catch { Start-Sleep -Milliseconds 500 }
}
if (-not $ready) { throw 'Isolated Neo4j did not become ready. Inspect .local/neo4j-console.log.' }
foreach ($taskName in @('data:audit','data:normalize','data:import','data:verify','admin:create','typecheck','lint','build')) {
  & npm.cmd run $taskName
  if ($LASTEXITCODE -ne 0) { throw "Bootstrap failed at $taskName. Existing data was not reset." }
}
& (Join-Path $PSScriptRoot 'start-local.ps1') -Background
Write-Output 'Open http://127.0.0.1:3000. Credentials are in private .env; no password was printed.'
