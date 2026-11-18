# Demo-mode preflight for QuestLearn.
#
# Answers, before someone opens the public URL in front of an audience: is this
# machine on mains power, is the backend healthy, is the preview serving the
# built app, does the preview reach the API, is the Funnel answering, and can a
# real account sign in through the public URL?
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1 -DryRun
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-preflight.ps1 -StartIfDown
#
# Exit codes: 0 every check passed, 1 a check failed, 2 the host or the
# configuration is unusable. SKIPPED is reported as SKIPPED, never as PASS.
#
# Settings come from a parameter, then the environment, then the default:
#
#   BackendUrl         QUESTLEARN_BACKEND_URL          http://localhost:8091
#   FrontendUrl        QUESTLEARN_FRONTEND_URL         http://localhost:5180
#   PublicUrl          QUESTLEARN_PUBLIC_URL           https://questlearn.taileb48b2.ts.net
#   Retries            QUESTLEARN_PREFLIGHT_RETRIES    3
#   TimeoutSeconds     QUESTLEARN_PREFLIGHT_TIMEOUT    10
#   RetryDelaySeconds  QUESTLEARN_PREFLIGHT_RETRY_DELAY 3
#   LogPath            QUESTLEARN_PREFLIGHT_LOG        logs\preflight.log
#   Email              QUESTLEARN_EMAIL                none, so auth is SKIPPED
#   Password           QUESTLEARN_PASSWORD             none
#
# The password is read from the environment only, never from a parameter: a
# parameter would put it in the process command line for anyone to read. When
# QUESTLEARN_PASSWORD is unset, DEMO_PASSWORD is read through questlearn-common,
# from the gitignored questlearn-backend\.env that the seeder also uses. Nothing
# here prints a password, a token, a cookie or a login response body.
#
# Nothing is started unless -StartIfDown is given, and even then the existing
# questlearn-up.ps1 does the work: this script only checks. It is safe to run as
# often as wanted, and it never touches power plans, services, the registry or
# the application's configuration.

[CmdletBinding()]
param(
    [string]$BackendUrl,
    [string]$FrontendUrl,
    [string]$PublicUrl,
    [int]$Retries = 0,
    [int]$TimeoutSeconds = 0,
    [int]$RetryDelaySeconds = 0,
    [string]$LogPath,
    [switch]$StartIfDown,
    [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'questlearn-common.ps1')

$script:Results = New-Object System.Collections.Generic.List[object]
$script:LogFile = $null
$script:Started = Get-Date

# ----------------------------------------------------------- configuration ---

function Resolve-Setting {
    param([string]$Value, [string]$EnvName, [string]$Default = '')
    if ($Value) { return $Value }
    if ($EnvName) {
        $fromEnv = [Environment]::GetEnvironmentVariable($EnvName)
        if ($fromEnv) { return $fromEnv }
    }
    return $Default
}

function Resolve-IntSetting {
    param([int]$Value, [string]$EnvName, [int]$Default)
    if ($Value -gt 0) { return $Value }
    $text = [Environment]::GetEnvironmentVariable($EnvName)
    $parsed = 0
    if ($text -and [int]::TryParse($text, [ref]$parsed) -and $parsed -gt 0) { return $parsed }
    return $Default
}

function Resolve-HttpUrl {
    param([string]$Value, [string]$Name)
    $uri = $null
    if (-not [Uri]::TryCreate($Value, [UriKind]::Absolute, [ref]$uri)) {
        throw "$Name is not an absolute URL: '$Value'"
    }
    if ($uri.Scheme -ne 'http' -and $uri.Scheme -ne 'https') {
        throw "$Name must use http or https: '$Value'"
    }
    if ($uri.UserInfo) {
        throw "$Name must not carry credentials in the URL."
    }
    return $uri.AbsoluteUri.TrimEnd('/')
}

function Join-Url {
    param([string]$Base, [string]$Path)
    return $Base.TrimEnd('/') + '/' + $Path.TrimStart('/')
}

# ---------------------------------------------------------------- output ----

$script:StatusColor = @{ PASS = 'Green'; FAIL = 'Red'; SKIPPED = 'Yellow' }

function Write-PreflightLog {
    param([string]$Message)
    if (-not $script:LogFile) { return }
    try {
        $line = '[{0:yyyy-MM-dd HH:mm:ss}] {1}' -f (Get-Date), $Message
        [System.IO.File]::AppendAllText($script:LogFile, $line + [Environment]::NewLine,
            (New-Object System.Text.UTF8Encoding($false)))
    } catch {
        # A log that cannot be written must not fail the preflight.
    }
}

function Write-ResultLine {
    param($Result, [int]$MaxDetail = 0)
    $detail = [string]$Result.Detail
    if ($MaxDetail -gt 0 -and $detail.Length -gt $MaxDetail) {
        $detail = $detail.Substring(0, $MaxDetail - 3) + '...'
    }
    $color = if ($script:StatusColor.ContainsKey($Result.Status)) { $script:StatusColor[$Result.Status] } else { 'Gray' }
    Write-Host ("  {0,-27} " -f $Result.Check) -NoNewline
    Write-Host ("{0,-8}" -f $Result.Status) -ForegroundColor $color -NoNewline
    Write-Host (" {0}" -f $detail)
}

# One call both records and prints a row, so no check can be printed without
# being reported, or reported without being printed.
function Complete-Check {
    param([string]$Check, [string]$Status, [string]$Detail = '')
    $result = [pscustomobject]@{ Check = $Check; Status = $Status; Detail = $Detail }
    $script:Results.Add($result)
    Write-PreflightLog ("{0}: {1}{2}" -f $Check, $Status, $(if ($Detail) { " ($Detail)" } else { '' }))
    Write-ResultLine -Result $result
}

function Write-Step {
    param([string]$Text)
    Write-Host ''
    Write-Host "== $Text" -ForegroundColor Cyan
}

# ------------------------------------------------------------- power state ---

function Get-AcState {
    try {
        $battery = @(Get-CimInstance -ClassName Win32_Battery -ErrorAction Stop)
    } catch {
        return [pscustomobject]@{
            Known  = $false
            OnAc   = $false
            Detail = "could not query Win32_Battery: $($_.Exception.Message)"
        }
    }
    if ($battery.Count -eq 0) {
        # A desktop has no battery; there is nothing to drain, so mains is a fair
        # reading. The demo laptop reports one entry.
        return [pscustomobject]@{ Known = $true; OnAc = $true; Detail = 'no battery reported, so mains power is assumed' }
    }
    $status = $battery[0].BatteryStatus
    if ($null -eq $status) {
        return [pscustomobject]@{ Known = $false; OnAc = $false; Detail = 'the battery reported no status' }
    }
    # 2 = AC, 3 = fully charged, 6 to 9 = charging, 11 = partially charged.
    # 1 = discharging, 4 = low, 5 = critical.
    $onAc = $status -in 2, 3, 6, 7, 8, 9, 11
    return [pscustomobject]@{ Known = $true; OnAc = $onAc; Detail = "BatteryStatus $status" }
}

# ------------------------------------------------------- keep awake (Win32) ---

# SetThreadExecutionState keeps the system out of automatic idle sleep for as
# long as the calling thread asks. It is deliberately not a power-plan change:
# nothing is written, and the request disappears with the thread.
#
# What it cannot do: it has no vote in a firmware-level Modern Standby
# transition, so the Kernel-Power 41 failures this machine sees on battery are
# only avoided by staying on mains. It is also per-thread and per-process, so a
# killed process, a crash or a power loss cannot run application-level cleanup.
# Windows clears the request when the thread goes away, which is why a hard kill
# leaves no permanent setting behind. The finally block in the run handles every
# normal and handled path, including Ctrl+C, which PowerShell runs as a pipeline
# stop.
function Enable-KeepAwake {
    if (-not ('QuestLearnExecutionState' -as [type])) {
        Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class QuestLearnExecutionState
{
    [DllImport("kernel32.dll", SetLastError = true)]
    public static extern uint SetThreadExecutionState(uint esFlags);

    public const uint ES_CONTINUOUS = 0x80000000;
    public const uint ES_SYSTEM_REQUIRED = 0x00000001;
}
'@
    }
    $flags = [uint32]([QuestLearnExecutionState]::ES_CONTINUOUS -bor [QuestLearnExecutionState]::ES_SYSTEM_REQUIRED)
    return [QuestLearnExecutionState]::SetThreadExecutionState($flags)
}

function Disable-KeepAwake {
    if ('QuestLearnExecutionState' -as [type]) {
        [QuestLearnExecutionState]::SetThreadExecutionState([QuestLearnExecutionState]::ES_CONTINUOUS) | Out-Null
    }
}

# ------------------------------------------------------------ HTTP probing ---

try {
    # Windows PowerShell defaults to an old protocol on some builds, which makes
    # a healthy Funnel look like a TLS failure. Never disable certificate checks.
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
} catch {
    # Leave the platform default in place; the TLS failure will be reported.
}

function Get-ProbeErrorKind {
    param($ErrorRecord)

    $exception = $ErrorRecord.Exception
    while ($exception) {
        if ($exception -is [System.Net.WebException]) {
            switch ($exception.Status) {
                'Timeout' { return 'timeout' }
                'NameResolutionFailure' { return 'dns' }
                'ProxyNameResolutionFailure' { return 'dns' }
                'ConnectFailure' { return 'connection' }
                'TrustFailure' { return 'tls' }
                'SecureChannelFailure' { return 'tls' }
                'ProtocolError' { return 'http' }
            }
        }
        if ($exception -is [System.Net.Sockets.SocketException]) {
            switch ($exception.SocketErrorCode) {
                'HostNotFound' { return 'dns' }
                'NoData' { return 'dns' }
                'ConnectionRefused' { return 'connection' }
                'NetworkUnreachable' { return 'connection' }
                'HostUnreachable' { return 'connection' }
                'TimedOut' { return 'timeout' }
            }
        }
        if ($exception -is [System.Security.Authentication.AuthenticationException]) { return 'tls' }
        if ($exception -is [System.Threading.Tasks.TaskCanceledException]) { return 'timeout' }
        if ($exception -is [System.OperationCanceledException]) { return 'timeout' }
        $exception = $exception.InnerException
    }
    return 'other'
}

function Get-KindText {
    param([string]$Kind, [int]$StatusCode)
    switch ($Kind) {
        'dns' { return 'DNS lookup failed' }
        'tls' { return 'TLS or certificate failure' }
        'timeout' { return "no answer within $TimeoutSeconds s" }
        'connection' { return 'connection refused or unreachable' }
        'http' { return "HTTP $StatusCode" }
        'not-ready' { return 'answered but not ready' }
        default { return 'request failed' }
    }
}

function Format-ProbeFailure {
    param($Result, [string]$Url)
    if ($Result.Kind -eq 'not-ready') { return $Result.Detail }
    return "$($Result.Detail) at $Url"
}

function Invoke-Probe {
    param(
        [string]$Uri,
        [string]$Method = 'GET',
        [string]$Body = '',
        [hashtable]$Headers = $null
    )

    $watch = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $request = @{
            Uri                = $Uri
            Method             = $Method
            UseBasicParsing    = $true
            TimeoutSec         = $TimeoutSeconds
            MaximumRedirection = 5
            ErrorAction        = 'Stop'
        }
        if ($Body) {
            $request['Body'] = $Body
            $request['ContentType'] = 'application/json'
        }
        if ($Headers) { $request['Headers'] = $Headers }

        $response = Invoke-WebRequest @request
        $watch.Stop()
        # Windows PowerShell turns an application/vnd.spring-boot.actuator+json
        # body into a byte array, because it treats that media type as binary.
        # Decode it, or the health check reads an empty string and calls a
        # healthy backend degraded.
        $content = $response.Content
        if ($content -is [byte[]]) {
            $content = [System.Text.Encoding]::UTF8.GetString($content)
        }
        return [pscustomobject]@{
            Ok         = $true
            StatusCode = [int]$response.StatusCode
            Ms         = [int]$watch.ElapsedMilliseconds
            Kind       = 'ok'
            Detail     = ''
            Content    = [string]$content
            Attempts   = 1
        }
    } catch {
        $watch.Stop()
        $status = 0
        $kind = Get-ProbeErrorKind $_
        if ($_.Exception -is [System.Net.WebException] -and $_.Exception.Response) {
            try { $status = [int]$_.Exception.Response.StatusCode } catch { $status = 0 }
        }
        if ($kind -eq 'http' -and $status -eq 0) { $kind = 'other' }

        $detail = Get-KindText -Kind $kind -StatusCode $status
        if ($kind -eq 'other') {
            # Exception text is kept for the terminal, but never the request body.
            $detail = $_.Exception.Message
        }
        # A URL echoed in an exception can carry userinfo; strip it.
        $detail = ($detail -replace '(?i)(https?://)[^/@\s]+@', '$1')
        if ($detail.Length -gt 160) { $detail = $detail.Substring(0, 160) }

        return [pscustomobject]@{
            Ok         = $false
            StatusCode = $status
            Ms         = [int]$watch.ElapsedMilliseconds
            Kind       = $kind
            Detail     = $detail
            Content    = ''
            Attempts   = 1
        }
    }
}

function Test-Retryable {
    param($ProbeResult)
    if ($ProbeResult.Ok) { return $false }
    if ($ProbeResult.Kind -in @('connection', 'timeout', 'dns', 'not-ready')) { return $true }
    if ($ProbeResult.Kind -eq 'http' -and ($ProbeResult.StatusCode -ge 500 -or $ProbeResult.StatusCode -eq 429)) {
        return $true
    }
    return $false
}

# Validate turns a 200 into a pass only when the body is what was expected. A
# failed validation is retried like a failed connection, because a backend that
# answers 200 with "DOWN" is usually still starting.
function Invoke-ProbeWithRetry {
    param(
        [string]$Uri,
        [string]$Label = 'request',
        [scriptblock]$Validate = $null
    )

    $attempts = [Math]::Max(1, $Retries)
    for ($attempt = 1; $attempt -le $attempts; $attempt++) {
        $result = Invoke-Probe -Uri $Uri
        $result.Attempts = $attempt
        if ($result.Ok -and $Validate) {
            $reason = & $Validate $result
            if ($reason) {
                $result.Ok = $false
                $result.Kind = 'not-ready'
                $result.Detail = [string]$reason
            }
        }
        if ($result.Ok) { return $result }
        if (-not (Test-Retryable $result) -or $attempt -eq $attempts) { return $result }
        Write-Host ("    {0} attempt {1}/{2}: {3}; retrying in {4}s" -f $Label, $attempt, $attempts,
            $result.Detail, $RetryDelaySeconds) -ForegroundColor DarkGray
        Start-Sleep -Seconds $RetryDelaySeconds
    }
}

function Test-Shell {
    param([string]$Html)
    if (-not $Html) { return $false }
    return ($Html -match 'id="root"') -and ($Html -match '<title>')
}

function Get-ShellProblem {
    param([string]$Html)
    if (Test-Shell $Html) { return '' }
    return 'answered, but the HTML is not the QuestLearn shell'
}

function Get-LoginPassword {
    if ($env:QUESTLEARN_PASSWORD) { return $env:QUESTLEARN_PASSWORD }
    $envFile = Join-Path (Split-Path -Parent $PSScriptRoot) 'questlearn-backend\.env'
    if (-not (Test-Path $envFile)) { return '' }
    try {
        $config = Read-DotEnv $envFile
        return [string]$config['DEMO_PASSWORD']
    } catch {
        return ''
    }
}

# A real sign-in through the public URL, using the ordinary login route. The
# token is used once for /auth/me to prove it is accepted, then dropped; it is
# never printed and never written to the log.
function Test-PublicLogin {
    param([string]$Email, [string]$Password)

    $body = @{ email = $Email; password = $Password } | ConvertTo-Json -Compress
    $login = Invoke-Probe -Uri (Join-Url $PublicUrl '/api/v1/auth/login') -Method Post -Body $body
    $Password = $null

    if ($login.Ok) {
        $token = $null
        try { $token = ($login.Content | ConvertFrom-Json).token } catch { $token = $null }
        if (-not $token) {
            return [pscustomobject]@{ Status = 'FAIL'; Detail = 'login answered 200 without a token' }
        }
        $me = Invoke-Probe -Uri (Join-Url $PublicUrl '/api/v1/auth/me') -Headers @{ Authorization = "Bearer $token" }
        $token = $null
        if ($me.Ok) {
            return [pscustomobject]@{ Status = 'PASS'; Detail = ("login and /auth/me accepted in {0} ms" -f ($login.Ms + $me.Ms)) }
        }
        return [pscustomobject]@{ Status = 'FAIL'; Detail = "the token was not accepted by /auth/me ($($me.Detail))" }
    }
    if ($login.StatusCode -eq 401) {
        return [pscustomobject]@{ Status = 'FAIL'; Detail = 'the public URL rejected the configured credentials' }
    }
    if ($login.StatusCode -eq 429) {
        return [pscustomobject]@{ Status = 'FAIL'; Detail = 'login throttled (HTTP 429); wait out LOGIN_LOCK_MINUTES and retry' }
    }
    return [pscustomobject]@{ Status = 'FAIL'; Detail = "$($login.Detail) at $PublicUrl/api/v1/auth/login" }
}

# --------------------------------------------------------------- the run ----

if ([System.Environment]::OSVersion.Platform -ne 'Win32NT') {
    Write-Host 'preflight: this script uses Windows power and execution-state APIs.' -ForegroundColor Red
    exit 2
}

try {
    $BackendUrl = Resolve-HttpUrl (Resolve-Setting $BackendUrl 'QUESTLEARN_BACKEND_URL' 'http://localhost:8091') 'BackendUrl'
    $FrontendUrl = Resolve-HttpUrl (Resolve-Setting $FrontendUrl 'QUESTLEARN_FRONTEND_URL' 'http://localhost:5180') 'FrontendUrl'
    $PublicUrl = Resolve-HttpUrl (Resolve-Setting $PublicUrl 'QUESTLEARN_PUBLIC_URL' 'https://questlearn.taileb48b2.ts.net') 'PublicUrl'
    $Retries = Resolve-IntSetting $Retries 'QUESTLEARN_PREFLIGHT_RETRIES' 3
    $TimeoutSeconds = Resolve-IntSetting $TimeoutSeconds 'QUESTLEARN_PREFLIGHT_TIMEOUT' 10
    $RetryDelaySeconds = Resolve-IntSetting $RetryDelaySeconds 'QUESTLEARN_PREFLIGHT_RETRY_DELAY' 3
    $LogPath = Resolve-Setting $LogPath 'QUESTLEARN_PREFLIGHT_LOG' (Join-Path (Split-Path -Parent $PSScriptRoot) 'logs\preflight.log')
} catch {
    Write-Host "preflight: $($_.Exception.Message)" -ForegroundColor Red
    exit 2
}

try {
    $logDirectory = Split-Path -Parent $LogPath
    if ($logDirectory -and -not (Test-Path $logDirectory)) {
        New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
    }
    $script:LogFile = $LogPath
} catch {
    Write-Host "preflight: could not prepare the log at $LogPath; continuing without one." -ForegroundColor Yellow
}

Write-Host ''
Write-Host 'QuestLearn demo preflight' -ForegroundColor White
Write-Host ("  started   {0:yyyy-MM-dd HH:mm:ss}" -f $script:Started)
Write-Host ("  backend   {0}" -f $BackendUrl)
Write-Host ("  frontend  {0}" -f $FrontendUrl)
Write-Host ("  public    {0}" -f $PublicUrl)
if ($DryRun) {
    Write-Host '  mode      dry run: no execution-state request, no login call, no start' -ForegroundColor Yellow
}
Write-PreflightLog ("preflight started (backend {0}, frontend {1}, public {2}, dry run {3})" -f
    $BackendUrl, $FrontendUrl, $PublicUrl, [bool]$DryRun)

# A. Mains power first: every failed resume this machine has seen came from a
# standby transition on battery, so nothing else is worth checking on DC.
Write-Step 'AC power'
$ac = Get-AcState
if (-not $ac.Known) {
    Complete-Check 'AC Power' 'FAIL' $ac.Detail
    Write-PreflightLog 'preflight stopped: AC state unknown'
    Write-Host ''
    Write-Host 'preflight: cannot confirm mains power, so nothing else was checked.' -ForegroundColor Red
    exit 1
}
if (-not $ac.OnAc) {
    Complete-Check 'AC Power' 'FAIL' "$($ac.Detail): the machine is running on battery"
    Write-Host '        Connect the charger before preparing or running the demo.' -ForegroundColor Red
    Write-PreflightLog 'preflight stopped: on battery'
    exit 1
}
Complete-Check 'AC Power' 'PASS' $ac.Detail

# B to F run inside one try/finally so the execution-state request is released
# on success, on a failed check, and on an exception. Ctrl+C reaches the finally
# as a pipeline stop; a killed process cannot run it, but Windows drops a
# thread's request when the thread ends.
$keepAwakeHeld = $false
$backendMs = $null
$frontendMs = $null
$publicMs = $null
$startedStack = $false

try {
    Write-Step 'Standby prevention'
    if ($DryRun) {
        Complete-Check 'Standby Prevention' 'SKIPPED' 'dry run: SetThreadExecutionState was not called'
    } else {
        $previousState = Enable-KeepAwake
        if ($previousState -eq 0) {
            Complete-Check 'Standby Prevention' 'FAIL' 'SetThreadExecutionState returned 0; the request was refused'
        } else {
            $keepAwakeHeld = $true
            Complete-Check 'Standby Prevention' 'PASS' 'ES_CONTINUOUS | ES_SYSTEM_REQUIRED held for this run'
        }
    }

    # C. Backend readiness.
    Write-Step 'Backend readiness'
    $healthUrl = Join-Url $BackendUrl '/actuator/health'
    $healthCheck = {
        param($probe)
        $status = $null
        try { $status = ($probe.Content | ConvertFrom-Json).status } catch { $status = $null }
        if ($status -eq 'UP') { return '' }
        if ($status) { return "health status $status" }
        return 'health answered without a status field'
    }
    $backend = Invoke-ProbeWithRetry -Uri $healthUrl -Label 'backend' -Validate $healthCheck

    if (-not $backend.Ok -and $StartIfDown) {
        if ($DryRun) {
            Write-Host '    (dry run: -StartIfDown ignored)' -ForegroundColor Yellow
        } else {
            Write-Host '    starting the existing stack through questlearn-up.ps1 ...' -ForegroundColor Yellow
            Write-PreflightLog 'StartIfDown: invoking questlearn-up.ps1'
            try {
                & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'questlearn-up.ps1')
                $startedStack = $true
            } catch {
                Write-Host "    the start script failed: $($_.Exception.Message)" -ForegroundColor Red
                Write-PreflightLog "StartIfDown failed: $($_.Exception.Message)"
            }
            $backend = Invoke-ProbeWithRetry -Uri $healthUrl -Label 'backend' -Validate $healthCheck
        }
    }

    $backendMs = $backend.Ms
    if ($backend.Ok) {
        $note = if ($startedStack) { 'after questlearn-up.ps1' } else { "after $($backend.Attempts) attempt(s)" }
        Complete-Check 'Backend Readiness' 'PASS' ("UP in {0} ms {1}" -f $backend.Ms, $note)
    } else {
        Complete-Check 'Backend Readiness' 'FAIL' (Format-ProbeFailure $backend $healthUrl)
    }

    # D. Frontend preview, then the preview's /api proxy so a dead backend is not
    # hidden behind a healthy static page.
    Write-Step 'Frontend readiness'
    $shellCheck = { param($probe) Get-ShellProblem $probe.Content }

    $frontend = Invoke-ProbeWithRetry -Uri (Join-Url $FrontendUrl '/') -Label 'frontend' -Validate $shellCheck
    $frontendMs = $frontend.Ms
    if ($frontend.Ok) {
        Complete-Check 'Frontend Readiness' 'PASS' ("QuestLearn shell in {0} ms" -f $frontend.Ms)
    } else {
        Complete-Check 'Frontend Readiness' 'FAIL' (Format-ProbeFailure $frontend "$FrontendUrl/")
    }

    # /api/v1/courses answers 401 without a token, which is exactly the proof
    # wanted here: the proxy reached the API, and the API refused politely. A 502
    # or 500 means the proxy could not reach the backend.
    $proxyUrl = Join-Url $FrontendUrl '/api/v1/courses'
    $proxy = Invoke-Probe -Uri $proxyUrl
    if ($proxy.Ok) {
        Complete-Check 'Frontend API Proxy' 'PASS' 'the preview proxy reached the API (HTTP 200)'
    } elseif ($proxy.StatusCode -ge 400 -and $proxy.StatusCode -lt 500) {
        Complete-Check 'Frontend API Proxy' 'PASS' "the preview proxy reached the API (HTTP $($proxy.StatusCode) without a token)"
    } else {
        Complete-Check 'Frontend API Proxy' 'FAIL' (Format-ProbeFailure $proxy $proxyUrl)
    }

    # E. Public URL, the login page, and a real sign-in through the Funnel.
    Write-Step 'Public URL'
    $public = Invoke-ProbeWithRetry -Uri (Join-Url $PublicUrl '/') -Label 'public URL' -Validate $shellCheck
    $publicMs = $public.Ms
    if ($public.Ok) {
        Complete-Check 'Public URL Accessibility' 'PASS' ("QuestLearn shell in {0} ms" -f $public.Ms)
    } else {
        Complete-Check 'Public URL Accessibility' 'FAIL' (Format-ProbeFailure $public "$PublicUrl/")
    }

    $loginUrl = Join-Url $PublicUrl '/login'
    $loginPage = Invoke-ProbeWithRetry -Uri $loginUrl -Label 'login page' -Validate $shellCheck
    if ($loginPage.Ok) {
        # The SPA serves the same document for every route; React renders the
        # route in the browser. This proves the route is served, not rendered.
        Complete-Check 'Login Page Accessibility' 'PASS' 'the SPA route is served; React renders it in the browser'
    } else {
        Complete-Check 'Login Page Accessibility' 'FAIL' (Format-ProbeFailure $loginPage $loginUrl)
    }

    $email = "$env:QUESTLEARN_EMAIL".Trim()
    $password = Get-LoginPassword
    if (-not $email -or -not $password) {
        Complete-Check 'Authentication Verification' 'SKIPPED' 'set QUESTLEARN_EMAIL + QUESTLEARN_PASSWORD, or DEMO_PASSWORD in .env'
    } elseif ($DryRun) {
        Complete-Check 'Authentication Verification' 'SKIPPED' 'dry run: the login call was not sent'
    } else {
        $auth = Test-PublicLogin -Email $email -Password $password
        Complete-Check 'Authentication Verification' $auth.Status $auth.Detail
    }
} catch {
    # An unexpected failure still has to produce a report and release the state.
    Complete-Check 'Preflight Run' 'FAIL' "unexpected error: $($_.Exception.Message)"
    Write-PreflightLog "unexpected error: $($_.Exception.Message)"
} finally {
    if ($keepAwakeHeld) {
        Disable-KeepAwake
        Write-PreflightLog 'execution-state request released'
    }
}

# F. The report.
$elapsed = (Get-Date) - $script:Started
Write-Host ''
Write-Host 'Preflight report' -ForegroundColor White
Write-Host ("  finished  {0:yyyy-MM-dd HH:mm:ss}" -f (Get-Date))
Write-Host ''
Write-Host ("  {0,-27} {1,-8} {2}" -f 'Check', 'Result', 'Detail')
Write-Host ("  {0,-27} {1,-8} {2}" -f ('-' * 27), ('-' * 8), ('-' * 40))
foreach ($result in $script:Results) {
    Write-ResultLine -Result $result -MaxDetail 74
}

Write-Host ''
$backendText = if ($null -ne $backendMs) { "$backendMs ms" } else { 'not measured' }
$frontendText = if ($null -ne $frontendMs) { "$frontendMs ms" } else { 'not measured' }
$publicText = if ($null -ne $publicMs) { "$publicMs ms" } else { 'not measured' }
Write-Host ("  backend response   {0}" -f $backendText)
Write-Host ("  frontend response  {0}" -f $frontendText)
Write-Host ("  public response    {0}" -f $publicText)
Write-Host ("  total duration     {0:N2} s" -f $elapsed.TotalSeconds)
Write-PreflightLog ("preflight finished in {0:N2}s; backend {1}, frontend {2}, public {3}" -f
    $elapsed.TotalSeconds, $backendText, $frontendText, $publicText)

$failed = @($script:Results | Where-Object { $_.Status -eq 'FAIL' })
$skipped = @($script:Results | Where-Object { $_.Status -eq 'SKIPPED' })

if ($failed.Count -gt 0) {
    Write-Host ''
    Write-Host 'What to do next' -ForegroundColor Yellow
    foreach ($result in $failed) {
        switch ($result.Check) {
            'AC Power' { Write-Host '  - Connect the charger and re-run; do not demo on battery.' }
            'Standby Prevention' { Write-Host '  - Run from an interactive PowerShell window and keep the lid open; Windows refused the request.' }
            'Backend Readiness' {
                Write-Host '  - Run scripts\questlearn-up.ps1 (or re-run this script with -StartIfDown).'
                $backendPort = ([Uri]$BackendUrl).Port
                if (-not (Get-NetTCPConnection -LocalPort $backendPort -State Listen -ErrorAction SilentlyContinue)) {
                    Write-Host ("    Nothing is listening on port {0}." -f $backendPort)
                }
                Write-Host '    Check logs\backend.log and logs\backend.start.log if it is restarting.'
            }
            'Frontend Readiness' { Write-Host '  - Run scripts\questlearn-up.ps1, or npm run publish if only the bundle is stale.' }
            'Frontend API Proxy' { Write-Host '  - The preview reached no API: start the backend, then check SERVER_PORT in questlearn-backend\.env.' }
            'Public URL Accessibility' { Write-Host '  - Run: tailscale funnel status; if it is not registered, tailscale funnel --bg 5180.' }
            'Login Page Accessibility' { Write-Host '  - The public route is not served: check the Funnel first, then npm run publish.' }
            'Authentication Verification' { Write-Host '  - Check QUESTLEARN_EMAIL and QUESTLEARN_PASSWORD; reset the demo password from /admin if it changed.' }
            default { Write-Host "  - $($result.Check): $($result.Detail)" }
        }
    }
    Write-Host ''
    Write-Host ("PREFLIGHT FAILED: {0} check(s) failed. Do not open the demo yet." -f $failed.Count) -ForegroundColor Red
    exit 1
}

Write-Host ''
if ($DryRun) {
    Write-Host 'PREFLIGHT PASSED (dry run): the checks that ran are healthy, but nothing was held awake and no sign-in was tested.' -ForegroundColor Green
} elseif ($skipped.Count -gt 0) {
    Write-Host 'PREFLIGHT PASSED: the demo is ready. Authentication was not verified (SKIPPED above).' -ForegroundColor Green
} else {
    Write-Host 'PREFLIGHT PASSED: the demo is ready.' -ForegroundColor Green
}
exit 0
