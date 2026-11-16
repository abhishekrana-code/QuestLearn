# Registers the weekly backup verification with Windows Task Scheduler.
# Needs an elevated shell, because a task that runs while nobody is signed in
# must run as SYSTEM.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-backup-check-task.ps1
#
# It runs on Sunday at 03:30, an hour after the nightly dump, so the check always
# sees a backup from the same night. A failure leaves backups\VERIFY-FAILED.txt
# and a non-zero task result.

param(
    [string]$At = '03:30',
    [ValidateSet('Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')]
    [string]$Day = 'Sunday'
)

$ErrorActionPreference = 'Stop'

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principalCheck = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principalCheck.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell window so the task can run as SYSTEM.'
}

$root = Split-Path -Parent $PSScriptRoot
$script = Join-Path $root 'scripts\questlearn-verify-backup.ps1'
if (-not (Test-Path $script)) { throw "Cannot find $script" }

$action = New-ScheduledTaskAction `
    -Execute 'powershell.exe' `
    -Argument ('-NoProfile -ExecutionPolicy Bypass -File "{0}"' -f $script) `
    -WorkingDirectory $root

$trigger = New-ScheduledTaskTrigger -Weekly -DaysOfWeek $Day -At $At

$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -MultipleInstances IgnoreNew `
    -ExecutionTimeLimit (New-TimeSpan -Minutes 30) `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName 'QuestLearn backup check' `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description 'Restores the newest QuestLearn backup into a scratch database and checks the row counts.' `
    -Force | Out-Null

$task = Get-ScheduledTask -TaskName 'QuestLearn backup check'
Write-Output ('Registered "{0}" as {1}, every {2} at {3}, next run {4}.' -f
    $task.TaskName, $task.Principal.UserId, $Day, $At, (Get-ScheduledTaskInfo -TaskName 'QuestLearn backup check').NextRunTime)
