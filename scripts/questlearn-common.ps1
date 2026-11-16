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

function Start-Backend {
    param(
        [string]$Jar,
        [string]$WorkingDirectory,
        [string]$LogDirectory,
        [int]$Port = 8091
    )
    Start-Process -FilePath 'java' `
        -ArgumentList '-jar', $Jar, "--server.port=$Port" `
        -WorkingDirectory $WorkingDirectory `
        -WindowStyle Hidden `
        -RedirectStandardOutput (Join-Path $LogDirectory 'backend.log') `
        -RedirectStandardError (Join-Path $LogDirectory 'backend.err.log')
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

function Wait-BackendHealth {
    param([int]$Port = 8091, [int]$Seconds = 90)
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
