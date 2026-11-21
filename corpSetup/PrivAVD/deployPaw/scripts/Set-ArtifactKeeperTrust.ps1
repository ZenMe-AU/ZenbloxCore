# Marks the Artifact Keeper private blob host as a Local Intranet site,
# machine-wide, so unattended winget installs from it are not held by the
# Internet-zone security prompt.
#
# Why: winget stamps downloaded installers with the Internet zone (Mark of the
# Web). For unsigned installers Windows then waits for a security confirmation
# that nobody can click in an unattended run, and winget hangs at "Starting
# package install". The private blob is reachable only through the PAW VNet's
# private endpoint, so it is an intranet resource.
#
# Verified 2026-11-21 on Windows 11 23H2 (AVD image): this policy Domains key
# takes effect immediately for all users. The 'ZoneMapKey' value form does NOT
# (it needs Group Policy processing).
#
# Run by deployPaw (azurerm_virtual_machine_run_command) when
# TF_VAR_ARTIFACT_KEEPER_BLOB_HOST is set. Idempotent.
param(
    [Parameter(Mandatory)] [string] $BlobHost
)

$ErrorActionPreference = 'Stop'

$labels = $BlobHost.Trim().ToLowerInvariant().Split('.')
if ($labels.Count -lt 3) { throw "Unexpected blob host '$BlobHost'" }

# ZoneMap\Domains layout: <registrable domain>\<rest of the host name>
$domain = ($labels[-2..-1]) -join '.'
$prefix = ($labels[0..($labels.Count - 3)]) -join '.'

$key = "HKLM:\SOFTWARE\Policies\Microsoft\Windows\CurrentVersion\Internet Settings\ZoneMap\Domains\$domain\$prefix"
New-Item -Path $key -Force | Out-Null
New-ItemProperty -Path $key -Name 'https' -Value 1 -PropertyType DWord -Force | Out-Null

Write-Output "Local Intranet zone: https://$BlobHost"
