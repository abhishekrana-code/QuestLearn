# Restarts the QuestLearn backend when it stops answering on 8091, and says so.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-watchdog.ps1
#
# It polls /actuator/health every 30 seconds and only acts after the API has been
# unhealthy for two minutes, so a rebuild by questlearn-watch-java.ps1 (about 27
# seconds) or a restore (about 30) never looks like a death.
#
# When it does act: stop the process that owns 8091, start the jar again, wait up to
# two minutes for health, then email the same address the backup check uses, saying
# what happened and whether the restart worked. Restarts are rate limited, so a
# backend that dies repeatedly produces one mail per attempt rather than a storm,
# and one thread is enough because there is a single-instance guard.
#
#   -IntervalSeconds 30      how often health is polled
#   -FailMinutes 2           unhealthy for this long before a restart
#   -CooldownMinutes 5       minimum gap between restart attempts
#   -RestartTimeoutSeconds   how long to wait for health after starting the jar

param(
    [int]$IntervalSeconds = 30,
    [int]$FailMinutes = 2,
    [int]$RestartTimeoutSeconds = 120,
    [int]$CooldownMinutes = 5
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'questlearn-backend'
$logs = Join-Path $root 'logs'
$jar = Join-Path $backend 'target\questlearn-1.0.0.jar'
$logFile = Join-Path $logs 'watchdog.log'
$healthUrl = 'http://localhost:8091/actuator/health'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# Two watchdogs would fight over the same port, so a second copy exits immediately.
# A file opened with FileShare.None is the lock: unlike a named mutex it needs no
# privilege to create across sessions, it works between the SYSTEM task and a manual
# run, and the handle is released by the operating system even if the script is
# killed mid-restart.
$lockPath = Join-Path $logs 'watchdog.lock'
try {
    $lock = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::OpenOrCreate,
        [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
} catch {
    Write-Output 'Another QuestLearn watchdog is already running.'
    exit 0
}

function Write-Log {
    param([string]$Message)
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
    Write-Output $line
    Add-Content -Path $logFile -Value $line -Encoding utf8
}

function Test-Health {
    try {
        $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 5
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Stop-Backend {
    # Only the process that owns 8091 is stopped, never a pattern match on names.
    $owners = Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    $stopped = @()
    foreach ($ownerPid in $owners) {
        try {
            $name = (Get-Process -Id $ownerPid -ErrorAction SilentlyContinue).ProcessName
            Stop-Process -Id $ownerPid -Force -ErrorAction Stop
            $stopped += "$name ($ownerPid)"
        } catch {
            Write-Log "Could not stop pid $ownerPid : $($_.Exception.Message)"
        }
    }
    return $stopped
}

function Start-Backend {
    Start-Process -FilePath 'java' `
        -ArgumentList '-jar', $jar, '--server.port=8091' `
        -WorkingDirectory $backend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') `
        -RedirectStandardError (Join-Path $logs 'backend.err.log')
}

function Send-Alert {
    param([string]$Subject, [string]$Body)
    $notifier = Join-Path $PSScriptRoot 'questlearn-notify.ps1'
    if (-not (Test-Path $notifier)) {
        Write-Log "No notifier at $notifier, so no alert was sent."
        return
    }
    try {
        $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $notifier -Subject $Subject -Body $Body 2>&1
        $code = $LASTEXITCODE
        foreach ($line in $output) { Write-Log "Alert: $line" }
        if ($code -ne 0) { Write-Log 'The alert could not be delivered.' }
    } catch {
        Write-Log "The alert could not be sent: $($_.Exception.Message)"
    }
}

if (-not (Test-Path $jar)) {
    Write-Log "No jar at $jar, so a restart would not be able to start anything. Waiting anyway."
}

Write-Log "Watchdog started: polling $healthUrl every ${IntervalSeconds}s, acting after $FailMinutes minute(s) of failure."

$unhealthySince = $null
$lastRestart = $null
$restartCount = 0

while ($true) {
    $healthy = Test-Health
    $now = Get-Date

    if ($healthy) {
        if ($unhealthySince) {
            $downFor = [math]::Round(($now - $unhealthySince).TotalMinutes, 1)
            Write-Log "Backend healthy again after $downFor minute(s) without a restart."
            $unhealthySince = $null
        }
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    if (-not $unhealthySince) {
        $unhealthySince = $now
        Write-Log 'Health check failed; starting the failure timer.'
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    $minutesDown = ($now - $unhealthySince).TotalMinutes
    if ($minutesDown -lt $FailMinutes) {
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    if ($lastRestart -and (($now - $lastRestart).TotalMinutes -lt $CooldownMinutes)) {
        Write-Log ('Unhealthy for {0:N1} minute(s), but the last restart was {1:N1} minute(s) ago; waiting.' -f
            $minutesDown, ($now - $lastRestart).TotalMinutes)
        Start-Sleep -Seconds $IntervalSeconds
        continue
    }

    $restartCount++
    $lastRestart = $now
    Write-Log ('Restarting after {0:N1} minute(s) unhealthy (attempt {1}).' -f $minutesDown, $restartCount)
    $stopped = Stop-Backend
    Start-Backend

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    $recovered = $false
    while ($timer.Elapsed.TotalSeconds -lt $RestartTimeoutSeconds) {
        Start-Sleep -Seconds 3
        if (Test-Health) { $recovered = $true; break }
    }
    $timer.Stop()
    $recoveredIn = [math]::Round($timer.Elapsed.TotalSeconds, 1)

    if ($recovered) {
        Write-Log "Backend healthy again after $recoveredIn seconds."
    } else {
        Write-Log "Backend still unhealthy $RestartTimeoutSeconds seconds after the restart."
    }

    $stoppedText = if ($stopped.Count -gt 0) { $stopped -join ', ' } else { 'nothing was listening on 8091' }
    $body = @(
        $(if ($recovered) { 'The QuestLearn backend stopped answering and was restarted successfully.' }
          else { 'The QuestLearn backend stopped answering and is STILL DOWN after a restart attempt.' }),
        '',
        "Machine:     $($env:COMPUTERNAME)",
        "Health URL:  $healthUrl",
        ('Down for:    {0:N1} minute(s) before restarting' -f $minutesDown),
        "Stopped:     $stoppedText",
        $(if ($recovered) { "Recovered:   health returned after $recoveredIn seconds" }
          else { "Recovery:    no healthy answer within $RestartTimeoutSeconds seconds" }),
        "Attempt:     $restartCount since this watchdog started",
        '',
        "Backend log: $(Join-Path $logs 'backend.log')",
        "Watchdog:    $logFile",
        '',
        'If it is still down, the jar or its configuration needs a look:',
        "  cd questlearn-backend; java -jar target\questlearn-1.0.0.jar --server.port=8091"
    ) -join [Environment]::NewLine

    $subject = if ($recovered) {
        "[QuestLearn] Backend restarted on $($env:COMPUTERNAME)"
    } else {
        "[QuestLearn] Backend is still down on $($env:COMPUTERNAME)"
    }
    Send-Alert -Subject $subject -Body $body

    # Clear the timer rather than resetting it to now: the next unhealthy poll starts a
    # fresh window, and the recovery message above is not repeated as a stray
    # "healthy again without a restart" line.
    $unhealthySince = $null
    Start-Sleep -Seconds $IntervalSeconds
}
