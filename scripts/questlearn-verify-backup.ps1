# Proves the newest QuestLearn backup can actually be restored and still holds data.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-verify-backup.ps1
#   powershell ... -Name 20261116-134035      a specific run instead of the newest
#
# What it does: takes the newest backup folder, creates a throwaway database, runs
# pg_restore into it, counts the rows that matter, then drops the scratch database.
# The live database and port 8091 are never touched, so this is safe to run while
# the demo is serving.
#
# It fails, with a non-zero exit code, a readable reason, and backups\VERIFY-FAILED.txt,
# when:
#   - there is no backup, or the newest one is older than -MaxAgeHours (default 48),
#     which means the nightly task has quietly stopped
#   - the dump is missing, or pg_restore exits non-zero
#   - users, courses or the seeded demo accounts come back below their floors
#   - uploads.zip is missing while the manifest records videos, cannot be expanded,
#     or its expanded file count or total size differs from the manifest
#
# Exit code 0 means the dump was restored and the counts looked right.

param(
    [string]$Name,
    [int]$MinUsers = 3,
    [int]$MinCourses = 1,
    [int]$MinDemoUsers = 1,
    [int]$MaxAgeHours = 48,
    [string]$ScratchDatabase = 'questlearn_restorecheck',
    [switch]$KeepScratch
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'questlearn-backend'
$backups = Join-Path $root 'backups'
$logs = Join-Path $root 'logs'
$pgBin = 'C:\Program Files\PostgreSQL\18\bin'
$psql = Join-Path $pgBin 'psql.exe'
$pgRestore = Join-Path $pgBin 'pg_restore.exe'
$logFile = Join-Path $logs 'verify-backup.log'
$failMarker = Join-Path $backups 'VERIFY-FAILED.txt'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Write-Log {
    param([string]$Message)
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
    Write-Output $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

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

# Native tools write progress to stderr, and PowerShell turns native stderr into a
# terminating error while ErrorActionPreference is Stop. Every call therefore goes
# through a one-line batch file that redirects both streams to a file, the same
# approach the restore script needs for the space in "C:\Program Files".
function Invoke-Native {
    param(
        [string]$Arguments,
        [string]$OutputFile,
        [string]$What
    )
    $cmdFile = Join-Path $logs 'verify-step.cmd'
    Set-Content -Path $cmdFile -Value ("@echo off`r`n" + $Arguments + ' > "' + $OutputFile + '" 2>&1') -Encoding ascii
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $cmdFile -NoNewWindow -Wait -PassThru
    $text = if (Test-Path $OutputFile) { (Get-Content $OutputFile -Raw) } else { '' }
    if ($process.ExitCode -ne 0) {
        throw "$What failed with exit code $($process.ExitCode). Output: $($text.Trim())"
    }
    return $text
}

function Invoke-Sql {
    param([string]$Database, [string]$Sql)
    # The SQL goes in a file rather than a -c argument: batch files treat % as a
    # variable marker, which silently mangled "LIKE '%@questlearn.dev'" and sent
    # psql a truncated query.
    $script:queryCount++
    $sqlFile = Join-Path $logs ("verify-query-{0}.sql" -f $script:queryCount)
    $outFile = Join-Path $logs ("verify-query-{0}.out" -f $script:queryCount)
    Set-Content -Path $sqlFile -Value $Sql -Encoding ascii
    $arguments = '"{0}" -w -h {1} -p {2} -U "{3}" -d {4} -tA -f "{5}"' -f
        $psql, $dbHost, $dbPort, $dbUser, $Database, $sqlFile
    $text = Invoke-Native -Arguments $arguments -OutputFile $outFile -What "psql on $Database"
    return $text.Trim()
}

$config = Read-DotEnv (Join-Path $backend '.env')
$match = [regex]::Match($config['DB_URL'], 'jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?;]+)')
if (-not $match.Success) { throw 'Cannot read a host and database out of DB_URL' }
$dbHost = $match.Groups[1].Value
$dbPort = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { '5432' }
$dbUser = $config['DB_USERNAME']

$script:queryCount = 0
$env:PGPASSWORD = $config['DB_PASSWORD']
$scratchCreated = $false
$checks = [ordered]@{}
$failure = $null

try {
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
    if (-not (Test-Path $dump)) { throw "No questlearn.dump in $source" }

    Write-Log "Checking backup $Name"

    # A backup that stops arriving is as bad as one that cannot be read, so the age
    # of the newest run is checked before the dump itself.
    $created = (Get-Item $dump).LastWriteTime
    $manifestPath = Join-Path $source 'manifest.json'
    $manifest = $null
    if (Test-Path $manifestPath) {
        try {
            $manifest = Get-Content $manifestPath -Raw | ConvertFrom-Json
            $created = [datetime]::Parse($manifest.createdAt).ToLocalTime()
        } catch {
            Write-Log 'manifest.json could not be read; falling back to the dump file time.'
        }
    }
    if (-not $manifest) {
        # The uploads archive is compared against the manifest, so a backup without
        # one cannot be verified even if its dump happens to restore.
        throw 'manifest.json is missing or unreadable, so the uploads archive cannot be checked.'
    }
    $ageHours = [math]::Round(((Get-Date) - $created).TotalHours, 1)
    $checks['ageHours'] = $ageHours
    if ($ageHours -gt $MaxAgeHours) {
        throw "The newest backup is $ageHours hours old, past the $MaxAgeHours hour limit. The nightly backup task may have stopped."
    }

    $restoreError = $null
    Invoke-Sql -Database 'postgres' -Sql "DROP DATABASE IF EXISTS $ScratchDatabase WITH (FORCE)" | Out-Null
    Invoke-Sql -Database 'postgres' -Sql "CREATE DATABASE $ScratchDatabase" | Out-Null
    $scratchCreated = $true

    $dumpSizeMb = [math]::Round((Get-Item $dump).Length / 1MB, 2)
    Write-Log "Restoring $dumpSizeMb MB into $ScratchDatabase"
    $restoreArgs = '"{0}" --host {1} --port {2} --username "{3}" --dbname {4} --no-owner --verbose "{5}"' -f
        $pgRestore, $dbHost, $dbPort, $dbUser, $ScratchDatabase, $dump
    $restoreOutput = Invoke-Native -Arguments $restoreArgs -OutputFile (Join-Path $logs 'verify-restore.log') -What 'pg_restore'
    $errors = ($restoreOutput -split "`r?`n" | Where-Object { $_ -match '^pg_restore: error:' })
    if ($errors.Count -gt 0) {
        throw "pg_restore reported $($errors.Count) error(s), first: $($errors[0])"
    }

    $users = [int](Invoke-Sql -Database $ScratchDatabase -Sql 'SELECT count(*) FROM users')
    $courses = [int](Invoke-Sql -Database $ScratchDatabase -Sql 'SELECT count(*) FROM courses')
    $demoUsers = [int](Invoke-Sql -Database $ScratchDatabase -Sql "SELECT count(*) FROM users WHERE email LIKE '%@questlearn.dev'")
    $schema = Invoke-Sql -Database $ScratchDatabase -Sql 'SELECT max(version) FROM flyway_schema_history WHERE success'
    $checks['users'] = $users
    $checks['courses'] = $courses
    $checks['demoUsers'] = $demoUsers
    $checks['schemaVersion'] = $schema

    Write-Log ("Restored: {0} users, {1} courses, {2} demo accounts, schema version {3}" -f $users, $courses, $demoUsers, $schema)

    if ($users -lt $MinUsers) { throw "Only $users user(s) restored, below the floor of $MinUsers." }
    if ($courses -lt $MinCourses) { throw "Only $courses course(s) restored, below the floor of $MinCourses." }
    if ($demoUsers -lt $MinDemoUsers) {
        throw "Only $demoUsers seeded demo account(s) restored, below the floor of $MinDemoUsers."
    }

    # The videos are not in the database, so a perfect dump can still sit beside an
    # empty or broken archive. Expand it and hold it to what the manifest recorded.
    $uploadsZip = Join-Path $source 'uploads.zip'
    $expectedFiles = [int]$manifest.uploadCount
    $expectedBytes = [long]$manifest.uploadBytes
    if ($manifest.hasUploads) {
        if (-not (Test-Path $uploadsZip)) {
            throw "The manifest records $expectedFiles upload(s) but uploads.zip is missing."
        }
        $scratch = Join-Path ([System.IO.Path]::GetTempPath()) ('questlearn-uploads-check-' + [guid]::NewGuid().ToString('N'))
        try {
            try {
                Expand-Archive -Path $uploadsZip -DestinationPath $scratch -Force -ErrorAction Stop
            } catch {
                throw "uploads.zip could not be expanded: $($_.Exception.Message)"
            }
            $extracted = @(Get-ChildItem -Path $scratch -Recurse -File)
            $actualFiles = $extracted.Count
            $actualBytes = [long](($extracted | Measure-Object Length -Sum).Sum)
            $checks['uploadFiles'] = $actualFiles
            $checks['uploadBytes'] = $actualBytes
            Write-Log ('Uploads: {0} file(s), {1:N2} MB expanded; manifest recorded {2} file(s), {3:N2} MB' -f
                $actualFiles, ($actualBytes / 1MB), $expectedFiles, ($expectedBytes / 1MB))
            if ($actualFiles -ne $expectedFiles) {
                throw "uploads.zip holds $actualFiles file(s) but the manifest recorded $expectedFiles."
            }
            if ($actualBytes -ne $expectedBytes) {
                throw "uploads.zip holds $actualBytes byte(s) but the manifest recorded $expectedBytes."
            }
        } finally {
            Remove-Item -Path $scratch -Recurse -Force -ErrorAction SilentlyContinue
        }
    } elseif (Test-Path $uploadsZip) {
        Write-Log 'The manifest records no uploads but uploads.zip exists; nothing to compare.'
    } else {
        Write-Log 'The manifest records no uploads and there is no archive, which is consistent.'
    }

    Write-Log 'Backup verified: the dump restores, the counts match, and the uploads archive matches the manifest.'
} catch {
    $failure = $_.Exception.Message
    Write-Log "BACKUP CHECK FAILED: $failure"
} finally {
    if ($scratchCreated -and -not $KeepScratch) {
        try {
            Invoke-Sql -Database 'postgres' -Sql "DROP DATABASE IF EXISTS $ScratchDatabase WITH (FORCE)" | Out-Null
            Write-Log "Dropped scratch database $ScratchDatabase"
        } catch {
            Write-Log "Could not drop $ScratchDatabase : $($_.Exception.Message)"
        }
    } elseif ($scratchCreated -and $KeepScratch) {
        Write-Log "Left $ScratchDatabase in place because -KeepScratch was passed."
    }
    Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
    # Keep the restore log for diagnosis, drop the per-query scratch files.
    Get-ChildItem -Path $logs -Filter 'verify-query-*' -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue
}

if ($failure) {
    $summary = @(
        "QuestLearn backup check FAILED at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')",
        "Backup: $Name",
        "Reason: $failure",
        "Log: $logFile"
    )
    Set-Content -Path $failMarker -Value $summary -Encoding utf8

    # A marker file nobody opens is not a warning. The alert goes out through the
    # same transport the app uses for its own mail, so a dead backup reaches the
    # person who can do something about it rather than waiting to be discovered.
    $notifier = Join-Path $PSScriptRoot 'questlearn-notify.ps1'
    if (Test-Path $notifier) {
        $body = @(
            'The weekly QuestLearn backup check failed, so the newest backup is not proven usable.',
            '',
            "Backup folder: $Name",
            "Reason: $failure",
            '',
            "Full log: $logFile",
            "Marker:    $failMarker",
            '',
            'To inspect it, run:',
            '  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-verify-backup.ps1 -KeepScratch',
            '',
            "This message was sent by $($env:COMPUTERNAME) at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')."
        ) -join [Environment]::NewLine
        try {
            $alertOutput = & powershell -NoProfile -ExecutionPolicy Bypass -File $notifier `
                -Subject "[QuestLearn] Backup check failed on $($env:COMPUTERNAME)" -Body $body 2>&1
            $alertCode = $LASTEXITCODE
            foreach ($line in $alertOutput) { Write-Log "Alert: $line" }
            if ($alertCode -ne 0) {
                Write-Log 'The alert could not be delivered; the marker and log are the only record.'
            }
        } catch {
            Write-Log "The alert could not be sent: $($_.Exception.Message)"
        }
    } else {
        Write-Log "No notifier at $notifier, so no alert was sent."
    }

    exit 1
}

if (Test-Path $failMarker) { Remove-Item $failMarker -Force }
exit 0
