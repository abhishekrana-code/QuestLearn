# Publishes the current frontend to the public demo URL.
#
# Rebuilds the bundle, restarts only the preview server on 5180, and leaves the
# backend and the Tailscale Funnel alone: the Funnel proxies to the port, so a new
# bundle appears at the same address without touching the tunnel or CORS.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-publish.ps1
#   ... -SkipBuild      publish the existing dist without rebuilding
#
# Backend changes are not covered here; restart the backend (or run
# questlearn-up.ps1) for those.

param(
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root 'questlearn-frontend'
$logs = Join-Path $root 'logs'
$publicUrl = 'https://questlearn.taileb48b2.ts.net'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

function Test-Url {
    param([string]$Url, [int]$TimeoutSeconds = 5)
    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Wait-Url {
    param([string]$Url, [int]$Seconds = 60)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-Url $Url 3) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

# Only the process that owns 5180 is stopped, never a pattern match on names.
function Stop-Preview {
    $owners = Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($ownerPid in $owners) {
        $process = Get-Process -Id $ownerPid -ErrorAction SilentlyContinue
        if ($process) {
            Write-Output ("Stopping preview (pid {0}, {1})" -f $process.Id, $process.ProcessName)
            Stop-Process -Id $process.Id -Force
        }
    }
    # The listener disappears a moment after the process does.
    $deadline = (Get-Date).AddSeconds(10)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-NetTCPConnection -LocalPort 5180 -State Listen -ErrorAction SilentlyContinue)) {
            return
        }
        Start-Sleep -Milliseconds 300
    }
}

if (-not $SkipBuild) {
    Write-Output 'Building the frontend...'
    # Through cmd and Start-Process: Windows PowerShell treats npm's stderr
    # notices as terminating errors under ErrorActionPreference=Stop.
    $build = Start-Process -FilePath 'cmd.exe' `
        -ArgumentList '/c', 'npm run build' `
        -WorkingDirectory $frontend `
        -NoNewWindow `
        -Wait `
        -PassThru `
        -RedirectStandardOutput (Join-Path $logs 'frontend.build.log') `
        -RedirectStandardError (Join-Path $logs 'frontend.build.err.log')
    if ($build.ExitCode -ne 0) {
        Write-Error "Build failed, see $logs\frontend.build.log"
    }
    Write-Output 'Build finished.'
}

Stop-Preview

Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', 'npm run preview' `
    -WorkingDirectory $frontend `
    -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $logs 'frontend.log') `
    -RedirectStandardError (Join-Path $logs 'frontend.err.log')

if (-not (Wait-Url 'http://127.0.0.1:5180/')) {
    Write-Error 'Preview did not answer on 127.0.0.1:5180.'
}

# The bundle in dist is the source of truth; the public page must reference it.
$indexHtml = Get-Content (Join-Path $frontend 'dist\index.html') -Raw
$bundle = [regex]::Match($indexHtml, '/assets/index-[^"]+\.js').Value

if (Test-Url "$publicUrl$bundle" 20) {
    Write-Output "Published: $publicUrl"
    Write-Output "Serving bundle: $bundle"
} else {
    Write-Warning "Local preview is up, but $publicUrl did not serve $bundle."
    Write-Warning 'Check the Funnel with: tailscale funnel status'
}
