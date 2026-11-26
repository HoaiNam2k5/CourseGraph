$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pidFile = Join-Path $projectRoot '.local\app.pid'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output 'No CourseGraph application PID recorded.'; exit 0 }
$appProcessId = [int](Get-Content -LiteralPath $pidFile)
$appProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$appProcessId"
$recordedAt = (Get-Item -LiteralPath $pidFile).LastWriteTimeUtc
$ownedProcess = $appProcess -and $appProcess.Name -eq 'node.exe' -and [Math]::Abs(($appProcess.CreationDate.ToUniversalTime() - $recordedAt).TotalSeconds) -lt 15
$matchesScript = $appProcess -and ($appProcess.CommandLine.Contains((Join-Path $projectRoot 'dist\apps\api\src\server.js')) -or $appProcess.CommandLine.Contains('dist/apps/api/src/server.js'))
if ($ownedProcess -and $matchesScript) {
  Stop-Process -Id $appProcessId
  Write-Output "Stopped CourseGraph app PID $appProcessId. Neo4j instances remain running."
} elseif ($appProcess) { throw 'Recorded PID no longer belongs to CourseGraph; refusing to stop it.' }
Remove-Item -LiteralPath $pidFile -Force
