# Restores a QuestLearn backup made by questlearn-backup.ps1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-restore.ps1
#   powershell ... -Name 20261115-023000     a specific run instead of the newest
#
# What it does, in order: stop the backend on 8091, drop and recreate the schema
# from the dump, replace the uploads directory with the archived copy, start the
# backend again and wait for /actuator/health. The old schema is replaced rather
# than merged, because a half-restored database that still holds newer rows is
# worse than an obvious restore.

param(
    [string]$Name
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'questlearn-backend'
$backups = Join-Path $root 'backups'
$logs = Join-Path $root 'logs'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$jar = Join-Path $backend 'target\questlearn-1.0.0.jar'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

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

function Test-Health {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8091/actuator/health' -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

if (-not $Name) {
    $latest = Get-ChildItem -Path $backups -Directory -ErrorAction SilentlyContinue |
        Where-Object { $_.Name -match '^\d{8}-\d{6}$' } |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if (-not $latest) { throw "No backups in $backups. Run questlearn-backup.ps1 first." }
    $Name = $latest.Name
}

$source = Join-Path $backups $Name
$dump = Join-Path $source 'questlearn.dump'
$uploadsZip = Join-Path $source 'uploads.zip'
if (-not (Test-Path $dump)) { throw "No questlearn.dump in $source" }

$config = Read-DotEnv (Join-Path $backend '.env')
$match = [regex]::Match($config['DB_URL'], 'jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?;]+)')
if (-not $match.Success) { throw 'Cannot read a host and database out of DB_URL' }

$dbHost = $match.Groups[1].Value
$dbPort = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { '5432' }
$dbName = $match.Groups[3].Value

Write-Output "Restoring $Name into $dbName on ${dbHost}:$dbPort"

# The backend holds connections and the schema, so it stops first. Only the
# process that owns 8091 is stopped.
$owners = Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
foreach ($ownerPid in $owners) {
    Write-Output "Stopping backend (pid $ownerPid)"
    Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
}
$deadline = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $deadline) {
    if (-not (Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue)) { break }
    Start-Sleep -Milliseconds 250
}

# pg_restore writes progress to stderr, and PowerShell turns native stderr into a
# terminating error while ErrorActionPreference is Stop, so the work is done in a
# cmd child whose output goes straight to a log file. PGPASSWORD is inherited.
$env:PGPASSWORD = $config['DB_PASSWORD']
$restoreLog = Join-Path $logs 'restore.log'
# A batch file avoids two levels of quoting: Start-Process re-quotes its argument
# array, and the PostgreSQL path contains a space.
$restoreCmd = Join-Path $logs 'restore.cmd'
$restoreLine = '"{0}" --host {1} --port {2} --username "{3}" --dbname {4} --clean --if-exists --no-owner --single-transaction --verbose "{5}" > "{6}" 2>&1' -f
    "$pgBin\pg_restore.exe", $dbHost, $dbPort, $config['DB_USERNAME'], $dbName, $dump, $restoreLog
Set-Content -Path $restoreCmd -Value $restoreLine -Encoding ascii

$restore = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $restoreCmd -NoNewWindow -Wait -PassThru
Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
if ($restore.ExitCode -ne 0) { throw "pg_restore failed with exit code $($restore.ExitCode), see logs\restore.log" }
Write-Output 'Database restored.'

if (Test-Path $uploadsZip) {
    $uploads = Join-Path $backend 'uploads'
    if (Test-Path $uploads) {
        # Replace rather than merge: a video left from the newer state would sit in
        # the media directory with no database row pointing at it.
        Remove-Item -Path $uploads -Recurse -Force
    }
    New-Item -ItemType Directory -Force -Path $uploads | Out-Null
    Expand-Archive -Path $uploadsZip -DestinationPath $uploads -Force
    $count = (Get-ChildItem -Path $uploads -Recurse -File).Count
    Write-Output "Uploads restored: $count file(s)."
} else {
    Write-Output 'This backup has no uploads archive; the media directory was left as it is.'
}

if (-not (Test-Path $jar)) { throw "No jar at $jar; build it with mvn -DskipTests package before restoring" }

Start-Process -FilePath 'java' `
    -ArgumentList '-jar', $jar, '--server.port=8091' `
    -WorkingDirectory $backend `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'backend.log') `
    -RedirectStandardError (Join-Path $logs 'backend.err.log')

$deadline = (Get-Date).AddSeconds(90)
$healthy = $false
while ((Get-Date) -lt $deadline) {
    if (Test-Health) { $healthy = $true; break }
    Start-Sleep -Seconds 1
}

if (-not $healthy) { throw 'Backend did not become healthy after the restore, see logs\backend.log' }
Write-Output 'Backend healthy. Restore complete.'
Write-Output "Public URL: https://questlearn.taileb48b2.ts.net"
