# Rebuilds and restarts the QuestLearn backend when Java code or resources change.
#
# Spring Boot DevTools was the other option and was not used: it only reloads when
# the app runs under `mvn spring-boot:run` (it is excluded from the executable jar)
# and it still needs something to recompile, which would mean a second JVM on this
# 8GB laptop. This script instead keeps the existing run model - build the jar,
# run the jar - and polls source timestamps rather than using a filesystem watcher,
# because polling a few hundred files every two seconds is cheap and survives
# editors that replace files instead of writing them in place.
#
# On this machine a changed backend costs about 20s to package and 12s to start,
# so expect roughly half a minute before the public URL serves the new code, and
# expect the API to answer 502 for the middle of that.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-watch-java.ps1

param(
    [int]$PollSeconds = 2,
    [int]$SettleSeconds = 2
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'questlearn-backend'
$logs = Join-Path $root 'logs'
$jar = Join-Path $backend 'target\questlearn-1.0.0.jar'
$jarBackup = Join-Path $backend 'target\questlearn-previous.jar'
$watchRoot = Join-Path $backend 'src\main'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

$extensions = @('.java', '.properties', '.sql', '.yml', '.yaml')

function Get-SourceStamp {
    $newest = Get-ChildItem -Path $watchRoot -Recurse -File |
        Where-Object { $extensions -contains $_.Extension } |
        Sort-Object LastWriteTimeUtc -Descending |
        Select-Object -First 1
    if (-not $newest) { return '' }
    return '{0}|{1}' -f $newest.LastWriteTimeUtc.Ticks, $newest.FullName
}

function Test-Health {
    try {
        $response = Invoke-WebRequest -Uri 'http://localhost:8091/actuator/health' -UseBasicParsing -TimeoutSec 2
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

# Only the process that owns 8091 is stopped, never a pattern match on names, so
# an unrelated Java process on this machine cannot be hit by a typo.
function Stop-Backend {
    $owners = Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
        Stop-Process -Id $ownerPid -Force -ErrorAction SilentlyContinue
    }
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue)) {
            return
        }
        Start-Sleep -Milliseconds 250
    }
}

function Start-Backend {
    Start-Process -FilePath 'java' `
        -ArgumentList '-jar', $jar, '--server.port=8091' `
        -WorkingDirectory $backend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') `
        -RedirectStandardError (Join-Path $logs 'backend.err.log')
}

function Wait-Health {
    param([int]$Seconds = 90)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Health) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Rebuild-And-Restart {
    if (-not (Test-Path $jar)) {
        Write-Output "No jar at $jar yet; build it once before relying on the watcher."
    }

    # Windows locks a jar that a JVM is running, and the repackage step renames it,
    # so the backend has to stop before Maven writes. Stopping first also means a
    # failed build could leave a thin jar behind, so the last good jar is copied
    # aside and put back if the build does not exit clean.
    if (Test-Path $jar) {
        Copy-Item -Path $jar -Destination $jarBackup -Force
    }
    Stop-Backend

    Write-Output ('[{0:HH:mm:ss}] change detected, packaging...' -f (Get-Date))
    $buildTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $build = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'mvn -q -DskipTests package' `
        -WorkingDirectory $backend `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'backend.build.log') `
        -RedirectStandardError (Join-Path $logs 'backend.build.err.log')
    $buildTimer.Stop()
    $buildSeconds = [math]::Round($buildTimer.Elapsed.TotalSeconds, 1)

    if ($build.ExitCode -ne 0) {
        # A broken build can leave a thin or partial jar; restore the last good one
        # so the demo stays on the previous code instead of going down.
        Write-Output ('[{0:HH:mm:ss}] build FAILED after {1}s, see logs\backend.build.log' -f (Get-Date), $buildSeconds)
        if (Test-Path $jarBackup) {
            Copy-Item -Path $jarBackup -Destination $jar -Force
            Write-Output 'Restored the previous jar.'
        }
    } else {
        Write-Output ('[{0:HH:mm:ss}] packaged in {1}s' -f (Get-Date), $buildSeconds)
    }

    Start-Backend
    $startupTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $healthy = Wait-Health
    $startupTimer.Stop()
    $startupSeconds = [math]::Round($startupTimer.Elapsed.TotalSeconds, 1)

    if ($healthy) {
        Write-Output ('[{0:HH:mm:ss}] healthy after {1}s (total {2}s)' -f (Get-Date), $startupSeconds, ($buildSeconds + $startupSeconds))
    } else {
        Write-Output ('[{0:HH:mm:ss}] NOT healthy after {1}s, see logs\backend.log' -f (Get-Date), $startupSeconds)
    }
}

$stamp = Get-SourceStamp
Write-Output "Watching $watchRoot for $($extensions -join ', ')"
Write-Output 'Ctrl+C stops the watcher; the backend keeps running.'

while ($true) {
    Start-Sleep -Seconds $PollSeconds
    $next = Get-SourceStamp
    if ($next -eq $stamp) { continue }

    # Wait for a burst of saves to finish before paying for a build.
    Start-Sleep -Seconds $SettleSeconds
    $stamp = Get-SourceStamp

    try {
        Rebuild-And-Restart
    } catch {
        Write-Output ('[{0:HH:mm:ss}] watcher error: {1}' -f (Get-Date), $_.Exception.Message)
    }
}
