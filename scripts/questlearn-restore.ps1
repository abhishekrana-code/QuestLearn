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

. (Join-Path $PSScriptRoot 'questlearn-common.ps1')

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

$database = Get-QuestLearnDatabase -EnvFile (Join-Path $backend '.env')
$dbHost = $database.Host
$dbPort = $database.Port
$dbName = $database.Name

Write-Output "Restoring $Name into $dbName on ${dbHost}:$dbPort"

# The backend holds connections and the schema, so it stops first.
Write-Output "Stopping backend: $(Stop-Backend)"
Wait-PortFree -Seconds 15 | Out-Null

# pg_restore writes progress to stderr, and PowerShell turns native stderr into a
# terminating error while ErrorActionPreference is Stop, so the work is done in a
# cmd child whose output goes straight to a log file. PGPASSWORD is inherited.
$env:PGPASSWORD = $database.Password
$restoreLine = '"{0}" --host {1} --port {2} --username "{3}" --dbname {4} --clean --if-exists --no-owner --single-transaction --verbose "{5}"' -f
    "$pgBin\pg_restore.exe", $dbHost, $dbPort, $database.User, $dbName, $dump
$restore = Invoke-CmdLine -Arguments $restoreLine -OutputFile (Join-Path $logs 'restore.log') -CmdFile (Join-Path $logs 'restore.cmd')
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

Start-Backend -Jar $jar -WorkingDirectory $backend -LogDirectory $logs
if (-not (Wait-BackendHealth)) { throw 'Backend did not become healthy after the restore, see logs\backend.log' }
Write-Output 'Backend healthy. Restore complete.'
Write-Output "Public URL: https://questlearn.taileb48b2.ts.net"
