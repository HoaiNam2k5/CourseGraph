param([Parameter(Mandatory=$true)][string]$BackupPath)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
Set-Location -LiteralPath $projectRoot
. (Join-Path $PSScriptRoot 'neo4j-admin.ps1')
if ([System.Net.NetworkInformation.IPGlobalProperties]::GetIPGlobalProperties().GetActiveTcpListeners().Port -contains 3001) { throw 'Stop the restored application on port3001 before restoring, so no process can keep the old JWT secret in memory.' }
$resolvedBackup = (Resolve-Path -LiteralPath $BackupPath).Path
$allowedBackupRoot = (Join-Path $projectRoot 'backups') + '\'
if (-not $resolvedBackup.StartsWith($allowedBackupRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Backup must be located inside this project backups directory.' }
$archiveInfo = Get-Content -Raw -LiteralPath (Join-Path $resolvedBackup 'archive.json') | ConvertFrom-Json
if ($archiveInfo.file -notmatch '^coursegraph(?:-test)?\.dump$') { throw 'Unsupported archive filename.' }
$archivePath = Join-Path $resolvedBackup $archiveInfo.file
if ((Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash -ne $archiveInfo.sha256) { throw 'Archive checksum mismatch; restore aborted.' }
$runtimeState = Get-Content -Raw -LiteralPath (Join-Path $projectRoot '.local\runtime-state.json') | ConvertFrom-Json
$runtimeHome = [IO.Path]::GetFullPath($runtimeState.home)
if (-not $runtimeHome.StartsWith((Join-Path $projectRoot '.local') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Runtime home must remain inside project .local.' }
$env:JAVA_HOME = $runtimeState.javaHome
$env:NEO4J_HOME = $runtimeHome
$env:NEO4J_ACCEPT_LICENSE_AGREEMENT = 'yes'
& npm.cmd run compile --silent
if ($LASTEXITCODE -ne 0) { throw 'Compile failed.' }
$targetDatabase = 'coursegraph-restore'
$stagingPath = Join-Path $projectRoot ('.local\restore-staging\' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stagingPath | Out-Null
Copy-Item -LiteralPath $archivePath -Destination (Join-Path $stagingPath ($targetDatabase + '.dump'))
& node.exe dist/scripts/db-control.js create $targetDatabase
if ($LASTEXITCODE -ne 0) { throw 'Cannot provision isolated restore database.' }
& node.exe dist/scripts/db-control.js stop $targetDatabase
if ($LASTEXITCODE -ne 0) { throw 'Cannot stop restore target.' }
try {
  Invoke-CourseGraphAdmin -Executable (Join-Path $runtimeHome 'bin\neo4j-admin.bat') -AdminArguments @('database','load',$targetDatabase,"--from-path=$stagingPath",'--overwrite-destination=true')
} finally {
  & node.exe dist/scripts/db-control.js start $targetDatabase
  if ($LASTEXITCODE -ne 0) { Write-Warning 'Restore target failed to start; main database is unchanged.' }
}
& node.exe dist/scripts/snapshot-database.js $targetDatabase (Join-Path $resolvedBackup 'restore-verification.json') (Join-Path $resolvedBackup 'manifest.json')
if ($LASTEXITCODE -ne 0) { throw 'Restored data failed manifest verification.' }
# The restored app gets a new signing secret; main app .env remains untouched.
& node.exe dist/scripts/rotate-restored-env.js
if ($LASTEXITCODE -ne 0) { throw 'Restored environment secret rotation failed.' }
Write-Output 'Restore verified on coursegraph-restore. Rotated signing secret saved in .local/restored.env; main app and .env are unchanged.'
