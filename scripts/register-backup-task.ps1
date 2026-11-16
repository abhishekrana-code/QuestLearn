# Registers the nightly QuestLearn backup with Windows Task Scheduler.
# Needs an elevated shell, because a task that runs while nobody is signed in
# must run as SYSTEM.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-task.ps1
#
# The task runs as SYSTEM so it does not depend on the demo account being signed
# in or on a stored password. It runs at 02:30 and, when the laptop was asleep or
# off at that time, as soon as it is next available.

param(
    [string]$At = '02:30'
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell window so the task can run as SYSTEM.'
}

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\questlearn-backup.ps1'
if (-not (Test-Path $script)) { throw "Cannot find $script" }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script) `
    -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Daily -At $At

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName 'QuestLearn backup' `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Nightly pg_dump and uploads copy for QuestLearn, keeping seven runs.' `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName 'QuestLearn backup'
Write-Output ('Registered "{0}" as {1}, daily at {2}, next run {3}.' -f
    $task.TaskName, $task.Principal.UserId, $At, (Get-ScheduledTaskInfo -TaskName 'QuestLearn backup').NextRunTime)
