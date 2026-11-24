# Lets session-host users open the Artifact Keeper read-only file share with
# their Entra account, without a password prompt or security warnings.
#
# 1. Cloud Kerberos ticket retrieval. Azure Files with Microsoft Entra Kerberos
#    (cloud-only accounts) needs CloudKerberosTicketRetrievalEnabled = 1 on
#    the client; without it the SMB client falls back to NTLM, which Azure
#    Files refuses, and Windows asks for a password. Applies after the next
#    restart.
# 2. Local Intranet zone for the share's file host (file protocol), machine
#    wide, so files opened from \\<account>.file.core.windows.net are not
#    treated as Internet content. Same policy key as Set-ArtifactKeeperTrust.ps1;
#    takes effect immediately.
#
# Keys are created only when missing: New-Item -Force on an EXISTING registry
# key wipes its values and subkeys (verified 2026-11-24), and the Kerberos
# Parameters key may hold other settings.
#
# Run by deployPaw (azurerm_virtual_machine_run_command) when
# TF_VAR_ARTIFACT_KEEPER_FILE_SHARE=true. Idempotent.
param(
    [Parameter(Mandatory)] [string] $FileHost
)

$ErrorActionPreference = 'Stop'

function Set-DwordValue {
    param([string] $Path, [string] $Name, [int] $Value)
    if (-not (Test-Path -Path $Path)) { New-Item -Path $Path -Force | Out-Null }
    New-ItemProperty -Path $Path -Name $Name -Value $Value -PropertyType DWord -Force | Out-Null
}

Set-DwordValue -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\Lsa\Kerberos\Parameters' -Name 'CloudKerberosTicketRetrievalEnabled' -Value 1
Write-Output 'Cloud Kerberos ticket retrieval: enabled (applies after the next restart)'

$labels = $FileHost.Trim().ToLowerInvariant().Split('.')
if ($labels.Count -lt 3) { throw "Unexpected file host '$FileHost'" }

# ZoneMap\Domains layout: <registrable domain>\<rest of the host name>
$domain = ($labels[-2..-1]) -join '.'
$prefix = ($labels[0..($labels.Count - 3)]) -join '.'

Set-DwordValue -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains\$domain\$prefix" -Name 'file' -Value 1
Write-Output "Local Intranet zone: file://$FileHost"
