param([ValidatePattern('^coursegraph(?:-test)?$')][string]$Database = 'coursegraph')
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot 'neo4j-admin.ps1')
$runtimeState = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.local\runtime-state.json') | ConvertFrom-Json
$runtimeHome = [IO.Path]::GetFullPath($runtimeState.home)
if (-not $runtimeHome.StartsWith((Join-Path $projectRoot '.local') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime home must remain inside this project .local directory.' }
$env:JAVA_HOME = $runtimeState.javaHome
$env:NEO4J_HOME = $runtimeHome
$env:NEO4J_ACCEPT_LICENSE_AGREEMENT = 'yes'
& npm.cmd run compile --silent
if ($LASTEXITCODE -ne 0) { throw 'Compile failed.' }
$backupPath = Join-Path $projectRoot ('backups\' + $Database + '-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
$appWasRunning = $false
$appListener = Get-NetTCPConnection -State Listen -LocalPort 3000 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($appListener) {
  $appPidFile = Join-Path $projectRoot '.local\app.pid'
  if (-not (Test-Path -LiteralPath $appPidFile) -or [int](Get-Content -LiteralPath $appPidFile) -ne $appListener.OwningProcess) { throw 'Stop the app manually before backup: port 3000 is not owned by the recorded CourseGraph process.' }
  & (Join-Path $PSScriptRoot 'stop-local.ps1')
  $appWasRunning = $true
}
$stopped = $false
try {
  & node.exe dist/scripts/snapshot-database.js $Database (Join-Path $backupPath 'manifest.json')
  if ($LASTEXITCODE -ne 0) { throw 'Could not snapshot database before backup.' }
  & node.exe dist/scripts/db-control.js stop $Database
  if ($LASTEXITCODE -ne 0) { throw 'Database did not stop; dump aborted.' }
  $stopped = $true
  Invoke-CourseGraphAdmin -Executable (Join-Path $runtimeHome 'bin\neo4j-admin.bat') -AdminArguments @('database','dump',$Database,"--to-path=$backupPath")
  $archive = Join-Path $backupPath ($Database + '.dump')
  if (-not (Test-Path -LiteralPath $archive)) { throw 'Dump archive was not created.' }
  @{ file = ($Database + '.dump'); sha256 = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash; bytes = (Get-Item -LiteralPath $archive).Length } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $backupPath 'archive.json') -Encoding UTF8
} finally {
  if ($stopped) {
    & node.exe dist/scripts/db-control.js start $Database
    if ($LASTEXITCODE -ne 0) { Write-Warning "Restart failed. Start $Database using the local instance before serving the app." }
  }
  if ($appWasRunning) { & (Join-Path $PSScriptRoot 'start-local.ps1') -Background }
}
Write-Output "Verified archive created: $backupPath"
