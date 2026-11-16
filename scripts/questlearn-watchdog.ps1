# Restarts the QuestLearn backend when it stops answering on 8091, and says so.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-watchdog.ps1
#
# It polls /actuator/health every 30 seconds and only acts after the API has been
# unhealthy for two minutes, so a rebuild by questlearn-watch-java.ps1 (about 27
# seconds) or a restore (about 30) never looks like a death.
#
# When it acts: stop the process that owns 8091, start the jar again, wait up to two
# minutes for health, then email the same address the backup check uses. One email
# per outage, plus a follow-up only if the first one said the backend was still down
# and it later came back, so a backend that cannot start does not mail on every
# attempt.
#
#   -IntervalSeconds 30   how often health is polled
#   -FailMinutes 2        unhealthy for this long before a restart

param(
    [int]$IntervalSeconds = 30,
    [int]$FailMinutes = 2
)

$ErrorActionPreference = 'Stop'

$RestartTimeoutSeconds = 120

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
    # Console, not the pipeline: inside Restart-Backend the pipeline is the function's
    # return value, so Write-Output there swallowed the log lines into the result.
    [Console]::Out.WriteLine($line)
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

function Send-Alert {
    param([string]$Subject, [string]$Body)
    $notifier = Join-Path $PSScriptRoot 'questlearn-notify.ps1'
    try {
        $output = & powershell -NoProfile -ExecutionPolicy Bypass -File $notifier -Subject $Subject -Body $Body 2>&1
        $code = $LASTEXITCODE
        foreach ($line in $output) { Write-Log "Alert: $line" }
        if ($code -ne 0) { Write-Log 'The alert could not be delivered.' }
    } catch {
        Write-Log "The alert could not be sent: $($_.Exception.Message)"
    }
}

# Stop and start one backend, then report whether health came back.
function Restart-Backend {
    # Only the process that owns 8091 is stopped, never a pattern match on names.
    $owners = @(Get-NetTCPConnection -LocalPort 8091 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
    $stopped = 'nothing was listening on 8091'
    if ($owners.Count -gt 0) {
        $stopped = ($owners | ForEach-Object {
            $name = (Get-Process -Id $_ -ErrorAction SilentlyContinue).ProcessName
            "$name ($_)"
        }) -join ', '
        Write-Log "Stopping $stopped"
        $owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    }

    Start-Process -FilePath 'java' `
        -ArgumentList '-jar', $jar, '--server.port=8091' `
        -WorkingDirectory $backend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') `
        -RedirectStandardError (Join-Path $logs 'backend.err.log')

    $timer = [System.Diagnostics.Stopwatch]::StartNew()
    while ($timer.Elapsed.TotalSeconds -lt $RestartTimeoutSeconds) {
        Start-Sleep -Seconds 3
        if (Test-Health) {
            Write-Log ('Backend healthy again after {0:N0} seconds.' -f $timer.Elapsed.TotalSeconds)
            return @{ Stopped = $stopped; Recovered = $true; Seconds = [math]::Round($timer.Elapsed.TotalSeconds, 0) }
        }
    }
    Write-Log "Backend still unhealthy $RestartTimeoutSeconds seconds after the restart."
    return @{ Stopped = $stopped; Recovered = $false; Seconds = $RestartTimeoutSeconds }
}

function Send-OutageAlert {
    param($Outcome, [double]$MinutesDown, [int]$Attempt)
    $state = if ($Outcome.Recovered) { 'The QuestLearn backend stopped answering and was restarted successfully.' }
             else { 'The QuestLearn backend stopped answering and is STILL DOWN after a restart attempt.' }
    $body = @(
        $state,
        '',
        "Machine:     $($env:COMPUTERNAME)",
        "Health URL:  $healthUrl",
        ('Down for:    {0:N1} minute(s) before restarting' -f $MinutesDown),
        "Stopped:     $($Outcome.Stopped)",
        "Recovery:    $(if ($Outcome.Recovered) { "healthy after $($Outcome.Seconds) seconds" } else { "no healthy answer within $RestartTimeoutSeconds seconds" })",
        "Attempt:     $Attempt for this outage",
        '',
        "Backend log: $(Join-Path $logs 'backend.log')",
        "Watchdog:    $logFile",
        '',
        'To start it by hand:',
        '  cd questlearn-backend; java -jar target\questlearn-1.0.0.jar --server.port=8091'
    ) -join [Environment]::NewLine

    $subject = if ($Outcome.Recovered) { "[QuestLearn] Backend restarted on $($env:COMPUTERNAME)" }
               else { "[QuestLearn] Backend is still down on $($env:COMPUTERNAME)" }
    Send-Alert -Subject $subject -Body $body
}

Write-Log "Watchdog started: polling $healthUrl every ${IntervalSeconds}s, restarting after $FailMinutes minute(s) of failure."

$unhealthySince = $null
$attempts = 0
$alerted = $false
$alertedWhileDown = $false

while ($true) {
    $now = Get-Date

    if (Test-Health) {
        if ($unhealthySince) {
            Write-Log ('Backend healthy again after {0:N1} minute(s) without a restart.' -f ($now - $unhealthySince).TotalMinutes)
            if ($alerted -and $alertedWhileDown) {
                Send-Alert -Subject "[QuestLearn] Backend back up on $($env:COMPUTERNAME)" -Body (
                    @(
                        'The QuestLearn backend is answering again after an outage that a restart did not fix.',
                        '',
                        "Machine:     $($env:COMPUTERNAME)",
                        "Health URL:  $healthUrl",
                        "Attempts:    $attempts",
                        "Watchdog:    $logFile"
                    ) -join [Environment]::NewLine)
            }
        }
        $unhealthySince = $null
        $attempts = 0
        $alerted = $false
        $alertedWhileDown = $false
    } elseif (-not $unhealthySince) {
        $unhealthySince = $now
        Write-Log 'Health check failed; starting the failure timer.'
    } elseif (($now - $unhealthySince).TotalMinutes -ge $FailMinutes) {
        $attempts++
        $minutesDown = ($now - $unhealthySince).TotalMinutes
        Write-Log ('Restarting after {0:N1} minute(s) unhealthy (attempt {1}).' -f $minutesDown, $attempts)
        $outcome = Restart-Backend
        if (-not $alerted) {
            Send-OutageAlert -Outcome $outcome -MinutesDown $minutesDown -Attempt $attempts
            $alerted = $true
            $alertedWhileDown = -not $outcome.Recovered
        } else {
            Write-Log 'Already alerted about this outage; not emailing again.'
        }
        # The next attempt needs another full failure window, which is what keeps a
        # crash loop to one restart per FailMinutes instead of one per poll.
        $unhealthySince = $null
    }

    Start-Sleep -Seconds $IntervalSeconds
}
