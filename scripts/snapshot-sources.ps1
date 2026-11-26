$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$snapshotDir = Join-Path $projectRoot ('backups\sources-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Force -Path $snapshotDir | Out-Null
$sourceFiles = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'CSV') -File)
$sourceFiles += @(Get-ChildItem -LiteralPath $projectRoot -File | Where-Object { $_.Extension -in @('.docx','.pdf','.dump') })
$manifest = foreach ($file in $sourceFiles) {
  $relative = $file.FullName.Substring($projectRoot.Length).TrimStart('\')
  $target = Join-Path $snapshotDir $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
  Copy-Item -LiteralPath $file.FullName -Destination $target
  $originalHash = (Get-FileHash -LiteralPath $file.FullName -Algorithm SHA256).Hash
  $copyHash = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash
  if ($originalHash -ne $copyHash) { throw "Snapshot verification failed: $relative" }
  @{ path = $relative; sha256 = $originalHash; bytes = $file.Length }
}
@{ createdAt = (Get-Date).ToString('o'); files = @($manifest) } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $snapshotDir 'manifest.json') -Encoding UTF8
Write-Output "Source snapshot verified: $($sourceFiles.Count) files in $snapshotDir"
