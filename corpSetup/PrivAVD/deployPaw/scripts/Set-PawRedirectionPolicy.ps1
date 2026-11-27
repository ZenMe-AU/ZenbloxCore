# Enforces clipboard direction and phone/camera blocking on the session host
# (deployPaw CLIPBOARD_MODE). The host pool RDP properties (avd.tf) only switch
# redirection on or off; these session-host policies decide what crosses:
#
# 1. Clipboard DIRECTION (Microsoft: "Configure the clipboard transfer
#    direction in Azure Virtual Desktop"):
#      SCClipLevel = session host -> user's device  (0 = blocked)
#      CSClipLevel = user's device -> session host  (1 = plain text only)
#    Modes:
#      paste-in : plain text can be pasted INTO the PAW, nothing copied out
#      two-way  : no direction policy (both values removed) - testing only
#      off      : both directions blocked (avd.tf also sets redirectclipboard:i:0)
# 2. Phones and cameras (MTP/PTP "supported Plug and Play devices") are
#    redirected by default; fDisablePNPRedir = 1 blocks them in every mode.
#
# The values live under HKLM\SOFTWARE\Policies\Microsoft\Windows NT\Terminal
# Services, which already holds other policy values (e.g. KeepAlive). The key
# is created only when missing: New-Item -Force on an EXISTING registry key
# wipes its values and subkeys (verified 2026-11-24).
#
# Run by deployPaw (azurerm_virtual_machine_run_command). Idempotent.
# Microsoft: restart the session host for these settings to take effect (the
# scaling plan's stop/start counts as a restart).
param(
    [Parameter(Mandatory)] [ValidateSet('paste-in', 'two-way', 'off')] [string] $ClipboardMode
)

$ErrorActionPreference = 'Stop'
$key = 'HKLM:\SOFTWARE\Policies\Microsoft\Windows NT\Terminal Services'

function Set-DwordValue {
    param([string] $Path, [string] $Name, [int] $Value)
    if (-not (Test-Path -Path $Path)) { New-Item -Path $Path -Force | Out-Null }
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
}

switch ($ClipboardMode) {
    'paste-in' {
        Set-DwordValue -Path $key -Name 'SCClipLevel' -Value 0
        Set-DwordValue -Path $key -Name 'CSClipLevel' -Value 1
    }
    'off' {
        Set-DwordValue -Path $key -Name 'SCClipLevel' -Value 0
        Set-DwordValue -Path $key -Name 'CSClipLevel' -Value 0
    }
    'two-way' {
        foreach ($name in 'SCClipLevel', 'CSClipLevel') {
            if ($null -ne (Get-ItemProperty -Path $key -Name $name -ErrorAction SilentlyContinue)) {
                Remove-ItemProperty -Path $key -Name $name
            }
        }
    }
}

Set-DwordValue -Path $key -Name 'fDisablePNPRedir' -Value 1

$now = Get-ItemProperty -Path $key
Write-Output ("Clipboard '{0}': SCClipLevel={1} CSClipLevel={2}; phones/cameras blocked: fDisablePNPRedir={3}. Applies after the next restart." -f $ClipboardMode, $now.SCClipLevel, $now.CSClipLevel, $now.fDisablePNPRedir)
