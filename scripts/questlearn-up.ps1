# Starts the QuestLearn demo stack and its public Tailscale Funnel.
#
# The frontend is served from its production build through `vite preview` on 5180,
# which proxies /api to the backend on 8091.
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

# The public URL serves the built app, not the dev server: no HMR websocket through
# the tunnel and no dev overlay on a demo. Preview keeps the /api proxy, so one
# public port still carries the whole application, and it reads dist from disk on
# each request, which is what lets the watcher below publish without a restart.
$frontend = Join-Path $root 'questlearn-frontend'

if (-not (Test-Path (Join-Path $frontend 'dist\index.html'))) {
    # Through cmd and Start-Process, because Windows PowerShell turns npm's stderr
    # notices into terminating errors under ErrorActionPreference=Stop.
    $build = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm run build' `
        -WorkingDirectory $frontend `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'frontend.build.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.build.err.log')
    if ($build.ExitCode -ne 0) {
        Write-Error "Frontend build failed, see $logs\frontend.build.log"
    }
}

if (-not (Test-Url 'http://localhost:5180/')) {
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm run preview' `
        -WorkingDirectory $frontend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'frontend.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.err.log')
    if (-not (Wait-Url 'http://localhost:5180/')) {
        Write-Error 'QuestLearn frontend preview did not answer on 5180.'
    }
}

# The watcher rebuilds dist whenever a frontend file changes, so an edit reaches
# the public URL in about a second without anyone running a publish command.
# It is skipped when one is already running, so this script stays safe to re-run.
$watchers = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -like '*vite*build*--watch*' }
if (-not $watchers) {
    Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm run watch' `
        -WorkingDirectory $frontend `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $logs 'frontend.watch.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.watch.err.log')
    Write-Output 'Frontend watcher started: edits publish on save.'
}

# --bg keeps the Funnel registered with the Tailscale service, so it resumes
# after a reboot instead of waiting for this script to run again.
if (Test-Path $tailscale) {
    & $tailscale funnel --bg 5180 | Out-Null
}
