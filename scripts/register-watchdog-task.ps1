# Registers the backend watchdog to start with Windows.
# Needs an elevated shell, because a task that runs before anyone signs in must
# run as SYSTEM.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-watchdog-task.ps1
#
# The task runs the watchdog loop continuously. Task Scheduler is told to restart it
# if it ever exits unexpectedly, and the script's own mutex stops a second copy from
# starting when the logon task also launches one.

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell window so the task can run as SYSTEM.'
}

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\questlearn-watchdog.ps1'
if (-not (Test-Path $script)) { throw "Cannot find $script" }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script) `
    -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -AtStartup

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1)

# A watchdog is meant to run for the life of the machine, so no execution limit.
$settings.ExecutionTimeLimit = 'PT0S'

Register-ScheduledTask `
    -TaskName 'QuestLearn watchdog' `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Polls the QuestLearn backend and restarts it, with an email, when it stays unhealthy.' `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName 'QuestLearn watchdog'
Write-Output ('Registered "{0}" as {1}, at startup. State: {2}.' -f
    $task.TaskName, $task.Principal.UserId, $task.State)
