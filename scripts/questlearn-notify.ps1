# Sends one operational alert through the mail transport QuestLearn already uses.
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\questlearn-notify.ps1 `
#       -Subject "QuestLearn alert" -Body "text"
#
# Order of preference, matching the backend's EmailConfig:
#   Resend when RESEND_API_KEY is set, then SMTP when MAIL_HOST is set.
#
# The recipient is, in order: -To, BACKUP_ALERT_EMAIL, ALERT_EMAIL, MAIL_USERNAME
# (the mailbox that owns the SMTP credentials), then MAIL_FROM. Setting
# BACKUP_ALERT_EMAIL in questlearn-backend\.env is the cleanest way to send these to
# a personal inbox instead of the account that does the sending.
#
# Exit code 0 means the transport accepted the message, 1 means it did not; the
# reason is printed either way, and the recipient is printed masked.

param(
    [Parameter(Mandatory = $true)][string]$Subject,
    [Parameter(Mandatory = $true)][string]$Body,
    [string]$To
)

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'questlearn-backend\.env'

. (Join-Path $PSScriptRoot 'questlearn-common.ps1')

function Mask-Address {
    param([string]$Address)
    if ($Address -match '^(.).*?(@.*)$') { return $Matches[1] + '***' + $Matches[2] }
    return 'an unprintable address'
}

function Get-BareAddress {
    param([string]$Value)
    if (-not $Value) { return $null }
    if ($Value -match '<([^>]+@[^>]+)>') { return $Matches[1].Trim() }
    if ($Value -match '^[^@\s]+@[^@\s]+\.[^@\s]+$') { return $Value.Trim() }
    return $null
}

$config = Read-DotEnv $envFile

$recipient = $To
if (-not $recipient) { $recipient = $config['BACKUP_ALERT_EMAIL'] }
if (-not $recipient) { $recipient = $config['ALERT_EMAIL'] }
if (-not $recipient) { $recipient = $config['MAIL_USERNAME'] }
if (-not $recipient) { $recipient = Get-BareAddress $config['MAIL_FROM'] }
if (-not $recipient) {
    Write-Output 'Alert not sent: no recipient. Set BACKUP_ALERT_EMAIL in questlearn-backend\.env.'
    exit 1
}

$from = Get-BareAddress $config['MAIL_FROM']
if (-not $from) { $from = 'no-reply@questlearn.dev' }

$masked = Mask-Address $recipient

try {
    if ($config['RESEND_API_KEY']) {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        $payload = @{
            from    = $from
            to      = @($recipient)
            subject = $Subject
            text    = $Body
        } | ConvertTo-Json -Depth 4
        $response = Invoke-RestMethod -Method Post `
            -Uri 'https://api.resend.com/emails' `
            -Headers @{ Authorization = "Bearer $($config['RESEND_API_KEY'])" } `
            -ContentType 'application/json' `
            -Body $payload `
            -TimeoutSec 20
        Write-Output "Alert sent to $masked through Resend (id $($response.id))."
        exit 0
    }

    if ($config['MAIL_HOST']) {
        $port = if ($config['MAIL_PORT']) { [int]$config['MAIL_PORT'] } else { 587 }
        $startTls = -not ($config['MAIL_SMTP_STARTTLS'] -and $config['MAIL_SMTP_STARTTLS'] -match '^(false|0)$')
        $message = New-Object System.Net.Mail.MailMessage($from, $recipient, $Subject, $Body)
        $message.BodyEncoding = [System.Text.Encoding]::UTF8
        $client = New-Object System.Net.Mail.SmtpClient($config['MAIL_HOST'], $port)
        $client.EnableSsl = $startTls
        $client.Timeout = 20000
        if ($config['MAIL_USERNAME']) {
            $client.Credentials = New-Object System.Net.NetworkCredential($config['MAIL_USERNAME'], $config['MAIL_PASSWORD'])
        }
        try {
            $client.Send($message)
        } finally {
            $message.Dispose()
            $client.Dispose()
        }
        Write-Output "Alert sent to $masked through SMTP at $($config['MAIL_HOST'])."
        exit 0
    }

    Write-Output 'Alert not sent: neither RESEND_API_KEY nor MAIL_HOST is configured in questlearn-backend\.env.'
    exit 1
} catch {
    Write-Output "Alert not sent to $masked : $($_.Exception.Message)"
    exit 1
}
