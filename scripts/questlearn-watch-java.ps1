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
# On this machine a changed backend costs about 20s to package and 10s to start
# when idle, but starts have been measured at 51s and 71s while the laptop was
# busy, which is why the wait below allows 150s. Expect the API to answer 502
# between the stop and the new jar answering.
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

. (Join-Path $PSScriptRoot 'questlearn-common.ps1')

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
    $stopped = Stop-Backend
    Write-Output ('[{0:HH:mm:ss}] stop: {1}' -f (Get-Date), $stopped)
    Wait-PortFree -Seconds 10 | Out-Null

    # Stop-Backend cannot stop a process owned by another account or one running at
    # a higher integrity level, for example the backend an elevated shell started.
    # The port stays bound, the jar stays locked for Maven, and the old JVM keeps
    # answering /actuator/health, so the run below used to build nothing, start
    # nothing and still print "healthy". Say so instead of reporting a success.
    $remaining = Get-BackendOwner
    if ($remaining.Count -gt 0) {
        $line = '[{0:HH:mm:ss}] STOP FAILED: pid {1} still owns port 8091 after 10s, so the old jar is still running. Nothing was rebuilt or restarted; stop that process (an elevated shell may be needed) and save a Java file to retry.' -f (Get-Date), ($remaining -join ', ')
        Write-Output $line
        [Console]::Error.WriteLine($line)
        return
    }

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

    Start-Backend -Jar $jar -WorkingDirectory $backend -LogDirectory $logs
    $startupTimer = [System.Diagnostics.Stopwatch]::StartNew()
    $healthy = Wait-BackendHealth
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
