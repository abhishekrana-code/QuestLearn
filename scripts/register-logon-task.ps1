# Registers the Windows logon task that starts QuestLearn and its Funnel.
#
# Needs an Administrator prompt, because creating a task for the machine's
# logon event is a system change. Run it again after moving the repository:
# the task stores the absolute path of questlearn-up.ps1.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\register-logon-task.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$upScript = Join-Path $root 'scripts\questlearn-up.ps1'
if (-not (Test-Path $upScript)) {
    throw "Cannot find $upScript"
}

$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument (
    '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "{0}"' -f $upScript
)
$trigger = New-ScheduledTaskTrigger -AtLogOn -User ('{0}\{1}' -f $env:USERDOMAIN, $env:USERNAME)
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask `
    -TaskName 'QuestLearn demo' `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description 'Starts the QuestLearn backend, frontend and public Tailscale Funnel at sign-in.' `
    -Force | Out-Null

Write-Output 'Registered task "QuestLearn demo" for logon.'
