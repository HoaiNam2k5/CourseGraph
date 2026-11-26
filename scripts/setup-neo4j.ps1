param(
  [string]$Distribution = "$env:USERPROFILE\.Neo4jDesktop2\Cache\dbmss\neo4j-enterprise-2026.09.0",
  [string]$JavaHome = "$env:USERPROFILE\.Neo4jDesktop2\Cache\runtime\zulu21.50.19-ca-jre21.0.11-win_x64",
  [switch]$Start
)
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$runtimeHome = Join-Path $projectRoot '.local\neo4j'
$runtimeBase = Join-Path $projectRoot '.local'
if (-not (Test-Path -LiteralPath (Join-Path $Distribution 'bin\neo4j.bat'))) { throw 'Neo4j distribution not found. Supply -Distribution from a local Neo4j Desktop cache.' }
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome 'bin\java.exe'))) { throw 'Java runtime not found. Supply -JavaHome.' }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot '.env'))) { throw 'Create .env from .env.example and fill generated credentials first.' }
New-Item -ItemType Directory -Force -Path $runtimeHome | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $runtimeHome 'lib'))) {
  foreach ($name in @('bin','lib','conf','licenses','certificates')) {
    $source = Join-Path $Distribution $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $runtimeHome -Recurse }
  }
  foreach ($name in @('LICENSE.txt','README.txt','ThirdPartyLicenses.txt','packaging_info','neo4j.cer')) {
    $source = Join-Path $Distribution $name
    if (Test-Path -LiteralPath $source) { Copy-Item -LiteralPath $source -Destination $runtimeHome }
  }
}
foreach ($name in @('data','logs','run','import','backups')) { New-Item -ItemType Directory -Force -Path (Join-Path $runtimeHome $name) | Out-Null }
$runtimeConfig = @'
server.default_listen_address=127.0.0.1
server.default_advertised_address=127.0.0.1
server.bolt.enabled=true
server.bolt.listen_address=:17687
server.bolt.advertised_address=127.0.0.1:17687
server.http.enabled=true
server.http.listen_address=:17474
server.http.advertised_address=127.0.0.1:17474
server.https.enabled=false
server.cluster.listen_address=127.0.0.1:16000
server.cluster.advertised_address=127.0.0.1:16000
server.cluster.raft.listen_address=127.0.0.1:17000
server.cluster.raft.advertised_address=127.0.0.1:17000
server.routing.listen_address=127.0.0.1:17688
server.routing.advertised_address=127.0.0.1:17688
server.backup.listen_address=127.0.0.1:16362
dbms.cluster.endpoints=127.0.0.1:16000
initial.dbms.default_database=coursegraph
dbms.security.auth_enabled=true
server.memory.heap.initial_size=256m
server.memory.heap.max_size=768m
server.memory.pagecache.size=256m
server.directories.data=data
server.directories.logs=logs
server.directories.run=run
server.directories.import=import
server.metrics.enabled=false
'@
$configPath = Join-Path $runtimeHome 'conf\neo4j.conf'
if (-not (Get-NetTCPConnection -State Listen -LocalPort 17687 -ErrorAction SilentlyContinue)) {
  [IO.File]::WriteAllText($configPath, $runtimeConfig, [Text.UTF8Encoding]::new($false))
}
if (-not (Test-Path -LiteralPath (Join-Path $runtimeHome 'data\databases\system')) ) {
  $runtimePasswordLine = Get-Content -LiteralPath (Join-Path $projectRoot '.env') | Where-Object { $_ -match '^NEO4J_PASSWORD=' } | Select-Object -First 1
  $runtimePassword = $runtimePasswordLine.Substring('NEO4J_PASSWORD='.Length)
  if ($runtimePassword.Length -lt 12) { throw 'NEO4J_PASSWORD must be at least 12 characters for the new isolated instance.' }
  $env:JAVA_HOME = $JavaHome
  $env:NEO4J_HOME = $runtimeHome
  # Reuse the installed Neo4j Desktop developer entitlement for local development only.
  # This is not a production license or a cloud deployment.
  $env:NEO4J_ACCEPT_LICENSE_AGREEMENT = 'yes'
  & (Join-Path $runtimeHome 'bin\neo4j-admin.bat') dbms set-initial-password $runtimePassword
  if ($LASTEXITCODE -ne 0) { throw 'Initial password setup failed.' }
  $runtimePassword = $null
}
$state = @{ home = $runtimeHome; javaHome = $JavaHome; http = 'http://127.0.0.1:17474'; bolt = 'bolt://127.0.0.1:17687'; owner = 'CourseGraph'; version = '2026.09.0' }
$state | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeBase 'runtime-state.json') -Encoding UTF8
if ($Start) {
  $existing = Get-NetTCPConnection -State Listen -LocalPort 17687 -ErrorAction SilentlyContinue
  if ($existing) { Write-Output 'Port 17687 is already listening; validate connectivity with npm run data:verify.'; exit 0 }
  $env:JAVA_HOME = $JavaHome
  $env:NEO4J_HOME = $runtimeHome
  $env:NEO4J_ACCEPT_LICENSE_AGREEMENT = 'yes'
  $outLog = Join-Path $runtimeBase 'neo4j-console.log'
  $errLog = Join-Path $runtimeBase 'neo4j-console-error.log'
  $proc = Start-Process -FilePath (Join-Path $runtimeHome 'bin\neo4j.bat') -ArgumentList 'console' -WorkingDirectory $runtimeHome -WindowStyle Hidden -RedirectStandardOutput $outLog -RedirectStandardError $errLog -PassThru
  $proc.Id | Set-Content -LiteralPath (Join-Path $runtimeBase 'neo4j-launcher.pid')
  Write-Output "CourseGraph isolated Neo4j launcher started (PID $($proc.Id)). Logs: .local/neo4j-console.log"
}
