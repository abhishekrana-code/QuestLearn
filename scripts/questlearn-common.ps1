# Helpers shared by the QuestLearn operations scripts. Dot-source it:
#
#   . (Join-Path $PSScriptRoot 'questlearn-common.ps1')
#
# These used to be copied into four or five scripts, so a fix had to be made in
# every copy: the .cmd workaround for pg_restore's stderr existed twice, and the
# dotenv reader existed four times.

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

# The database connection, read from the same .env the backend uses, so no script
# carries a second copy of the JDBC URL parsing.
function Get-QuestLearnDatabase {
    param([string]$EnvFile)
    $config = Read-DotEnv $EnvFile
    $match = [regex]::Match($config['DB_URL'], 'jdbc:postgresql://([^:/]+)(?::(\d+))?/([^?;]+)')
    if (-not $match.Success) { throw 'Cannot read a host and database out of DB_URL' }
    return [pscustomobject]@{
        Host     = $match.Groups[1].Value
        Port     = if ($match.Groups[2].Success) { $match.Groups[2].Value } else { '5432' }
        Name     = $match.Groups[3].Value
        User     = $config['DB_USERNAME']
        Password = $config['DB_PASSWORD']
        Config   = $config
    }
}

function Test-BackendHealth {
    param([int]$Port = 8091, [int]$TimeoutSeconds = 5)
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:$Port/actuator/health" -UseBasicParsing -TimeoutSec $TimeoutSeconds
        return $response.StatusCode -eq 200
    } catch {
        return $false
    }
}

function Get-BackendOwner {
    param([int]$Port = 8091)
    return @(Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty OwningProcess -Unique)
}

# Stops whatever owns the port, never a process matched by name, and returns a
# short description of what went.
function Stop-Backend {
    param([int]$Port = 8091)
    $owners = Get-BackendOwner -Port $Port
    if ($owners.Count -eq 0) { return "nothing was listening on $Port" }
    $names = @($owners | ForEach-Object {
        $process = Get-Process -Id $_ -ErrorAction SilentlyContinue
        if ($process) { "$($process.ProcessName) ($_)" } else { "pid $_" }
    })
    $owners | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
    return ($names -join ', ')
}

# A jar started without flags gets a maximum heap of a quarter of physical memory,
# which is about 2GB on this 8GB laptop and competes with Postgres, the preview
# server and Chrome. A 768MB ceiling is well above what the demo needs and keeps a
# runaway allocation from pushing the machine into the page file.
$BackendHeapArguments = @('-Xms256m', '-Xmx768m')

function Start-Backend {
    param(
        [string]$Jar,
        [string]$WorkingDirectory,
        [string]$LogDirectory,
        [int]$Port = 8091
    )
    $arguments = $BackendHeapArguments + @('-jar', $Jar, "--server.port=$Port")

    # The heap flags and the jar path were only visible by querying the running
    # process, which needs elevation when the watchdog starts it as SYSTEM. Record
    # the command here instead, in its own file: backend.log is truncated by the
    # next start, so a line there would not survive to be read afterwards.
    # Keep the log of the run being replaced: a slow start is only diagnosable from
    # the log it wrote, and the redirect below truncates that file on every start.
    foreach ($pair in @(@('backend.log', 'backend.previous.log'), @('backend.err.log', 'backend.previous.err.log'))) {
        $current = Join-Path $LogDirectory $pair[0]
        if (Test-Path $current) {
            try { Copy-Item -Path $current -Destination (Join-Path $LogDirectory $pair[1]) -Force }
            catch { Write-Warning "Could not keep $($pair[0]): $($_.Exception.Message)" }
        }
    }

    $rendered = ($arguments | ForEach-Object { if ($_ -match '\s') { '"' + $_ + '"' } else { $_ } }) -join ' '
    $line = '[{0:yyyy-MM-dd HH:mm:ss}] java {1}    (port {2}, working dir {3})' -f (Get-Date), $rendered, $Port, $WorkingDirectory
    try {
        $startLog = Join-Path $LogDirectory 'backend.start.log'
        [System.IO.File]::AppendAllText($startLog, $line + [Environment]::NewLine, (New-Object System.Text.UTF8Encoding($false)))
    } catch { Write-Warning "Could not record the start command: $($_.Exception.Message)" }

    Start-Process -FilePath 'java' `
        -ArgumentList $arguments `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDirectory 'backend.log') `
        -RedirectStandardError (Join-Path $LogDirectory 'backend.err.log')
}

# True when a QuestLearn JVM exists at all. The port only opens at the end of a
# start, so a process with no listener is still loading classes rather than gone.
# A process owned by another account can hide its command line, which reads as
# "not starting" and falls back to the old stop-and-restart behaviour.
function Test-BackendStartInProgress {
    param([string]$JarHint = 'questlearn')
    try {
        $java = Get-CimInstance Win32_Process -Filter "Name = 'java.exe'" -ErrorAction Stop
    } catch {
        return $false
    }
    foreach ($process in $java) {
        if ($process.CommandLine -and $process.CommandLine -like "*$JarHint*") { return $true }
    }
    return $false
}

function Wait-PortFree {
    param([int]$Port = 8091, [int]$Seconds = 15)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (-not (Get-BackendOwner -Port $Port)) { return $true }
        Start-Sleep -Milliseconds 250
    }
    return $false
}

# 150s was too short for a start issued while Windows is still booting, which was
# measured at 245s; this matches the watchdog's start budget.
function Wait-BackendHealth {
    param([int]$Port = 8091, [int]$Seconds = 480)
    $deadline = (Get-Date).AddSeconds($Seconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-BackendHealth -Port $Port) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

# Native tools write progress to stderr, and PowerShell turns native stderr into a
# terminating error while ErrorActionPreference is Stop. A one-line batch file with
# both streams redirected keeps that out of PowerShell, and avoids Start-Process
# re-quoting arguments until the space in "C:\Program Files\..." splits the command.
function Invoke-CmdLine {
    param(
        [string]$Arguments,
        [string]$OutputFile,
        [string]$CmdFile
    )
    Set-Content -Path $CmdFile -Value ("@echo off`r`n" + $Arguments + ' > "' + $OutputFile + '" 2>&1') -Encoding ascii
    $process = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', $CmdFile -NoNewWindow -Wait -PassThru
    $text = if (Test-Path $OutputFile) { Get-Content $OutputFile -Raw } else { '' }
    return [pscustomobject]@{ ExitCode = $process.ExitCode; Output = $text }
}
