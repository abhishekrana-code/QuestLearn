# Starts the QuestLearn demo stack and its public Tailscale Funnel.
#
# Safe to run twice: each piece is skipped when it is already answering. The
# Windows logon task calls this file, so a reboot puts the demo back without
# anyone typing a command.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-up.ps1
#
# Logs land in logs\ at the repository root.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$logs = Join-Path $root 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null
$tailscale = 'C:\Program Files\Tailscale\tailscale.exe'

function Test-Url {
    param([string]$Url)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 3
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-Url {
    param([string]$Url, [int]$Seconds = 150)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Url $Url) { return $true }
        Start-Sleep -Seconds 2
    }
    return $false
}

# The backend reads its own .env through spring.config.import, so CORS origins,
# the database and the demo password all come from one file.
if (-not (Test-Url 'http://localhost:8091/actuator/health')) {
    Start-Process -FilePath 'java' `
        -ArgumentList '-jar', 'target/questlearn-1.0.0.jar', '--server.port=8091' `
        -WorkingDirectory (Join-Path $root 'questlearn-backend') `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'backend.log') `
        -RedirectStandardError (Join-Path $logs 'backend.err.log')
    if (-not (Wait-Url 'http://localhost:8091/actuator/health')) {
        Write-Error 'QuestLearn backend did not become healthy on 8091.'
    }
}

# Vite serves the app and proxies /api to 8091, which is why one public port
# covers the whole application.
if (-not (Test-Url 'http://localhost:5180/')) {
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm run dev -- --host 0.0.0.0 --port 5180 --strictPort' `
        -WorkingDirectory (Join-Path $root 'questlearn-frontend') `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'frontend.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.err.log')
    if (-not (Wait-Url 'http://localhost:5180/')) {
        Write-Error 'QuestLearn frontend did not answer on 5180.'
    }
}

# --bg keeps the Funnel registered with the Tailscale service, so it resumes
# after a reboot instead of waiting for this script to run again.
if (Test-Path $tailscale) {
    & $tailscale funnel --bg 5180 | Out-Null
}
