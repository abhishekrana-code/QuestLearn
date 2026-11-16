# Dumps the QuestLearn database and the uploaded lesson videos into one timestamped
# folder, then deletes folders older than the retention count.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-backup.ps1
#   ... -Keep 14        keep the last fourteen runs instead of seven
#
# Each run writes backups\<yyyyMMdd-HHmmss>\ containing:
#   questlearn.dump     pg_dump custom format, restorable with pg_restore
#   uploads.zip         the media directory, as it is
#   manifest.json       what was captured, from where, and its size
#
# Credentials come from questlearn-backend\.env, the same file the backend reads,
# so nothing is duplicated here. Nothing secret is written into the backup folder:
# the manifest records the database name and host only.

param(
    [int]$Keep = 7
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'questlearn-backend'
$backups = Join-Path $root 'backups'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'

function Read-DotEnv {
    param([string]$Path)
    $values = @{}
    if (-not (Test-Path $Path)) { throw "Cannot find $Path" }
    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#') -or -not $trimmed.Contains('=')) { continue }
        $index = $trimmed.IndexOf('=')
        $values[$trimmed.Substring(0, $index).Trim()] = $trimmed.Substring($index + 1).Trim()
    }
    return $values
}

$config = Read-DotEnv (Join-Path $backend '.env')
$url = $config['DB_URL']
$match = [regex]::Match($url, 'jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?;]+)')
if (-not $match.Success) { throw "Cannot read a host and database out of DB_URL" }

$dbHost = $match.Groups[1].Value
$dbPort = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { '5432' }
$dbName = $match.Groups[3].Value
$dbUser = $config['DB_USERNAME']
$dbPassword = $config['DB_PASSWORD']

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $backups $stamp
New-Item -ItemType Directory -Force -Path $target | Out-Null

# pg_dump authenticates through the environment, never the command line, so the
# password cannot show up in a process list.
$env:PGPASSWORD = $dbPassword

Write-Output "Backing up $dbName on ${dbHost}:$dbPort to $target"
& "$pgBin\pg_dump.exe" `
    --host $dbHost `
    --port $dbPort `
    --username $dbUser `
    --format=custom `
    --no-owner `
    --file (Join-Path $target 'questlearn.dump') `
    $dbName
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue

$uploads = Join-Path $backend 'uploads'
$uploadsZip = Join-Path $target 'uploads.zip'
$uploadCount = 0
$uploadBytes = 0
if (Test-Path $uploads) {
    $files = Get-ChildItem -Path $uploads -Recurse -File
    $uploadCount = $files.Count
    $uploadBytes = ($files | Measure-Object Length -Sum).Sum
    if ($uploadCount -gt 0) {
        # Compress-Archive refuses an empty set, hence the guard.
        Compress-Archive -Path (Join-Path $uploads '*') -DestinationPath $uploadsZip -CompressionLevel Optimal
    }
}

$dumpBytes = (Get-Item (Join-Path $target 'questlearn.dump')).Length
$manifest = [ordered]@{
    createdAt = (Get-Date).ToUniversalTime().ToString('o')
    database  = $dbName
    host      = $dbHost
    dumpBytes = $dumpBytes
    uploadCount = $uploadCount
    uploadBytes = $uploadBytes
    hasUploads  = (Test-Path $uploadsZip)
}
$manifest | ConvertTo-Json | Set-Content -Path (Join-Path $target 'manifest.json') -Encoding utf8

Write-Output ('Database dump: {0:N1} MB' -f ($dumpBytes / 1MB))
Write-Output ('Uploads: {0} files, {1:N1} MB' -f $uploadCount, ($uploadBytes / 1MB))

# Retention: newest folders stay, anything past $Keep goes. Only folders directly
# under backups\ that match the timestamp pattern are ever considered.
$runs = Get-ChildItem -Path $backups -Directory |
    Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
    Sort-Object Name -Descending
$old = $runs | Select-Object -Skip $Keep
foreach ($folder in $old) {
    Remove-Item -Path $folder.FullName -Recurse -Force
    Write-Output "Removed old backup $($folder.Name)"
}
Write-Output ('Kept {0} of {1} run(s).' -f ([math]::Min($runs.Count, $Keep)), $runs.Count)
