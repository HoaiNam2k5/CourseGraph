function Invoke-CourseGraphAdmin {
  param([Parameter(Mandatory=$true)][string]$Executable, [Parameter(Mandatory=$true)][string[]]$AdminArguments)
  $previousPreference = $ErrorActionPreference
  $nativeExitCode = -1
  try {
    # Windows PowerShell promotes redirected native stderr to ErrorRecord.
    # Java writes harmless incubator warnings there; use the native exit code.
    $ErrorActionPreference = 'Continue'
    & $Executable @AdminArguments 2>&1 | ForEach-Object { Write-Output $_.ToString() }
    $nativeExitCode = $LASTEXITCODE
  } finally { $ErrorActionPreference = $previousPreference }
  if ($nativeExitCode -ne 0) { throw "Neo4j administration command failed with exit code $nativeExitCode. Inspect the job log." }
}
