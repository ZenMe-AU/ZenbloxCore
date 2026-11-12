#requires -RunAsAdministrator
# Baseline PAW hardening applied during the golden image build. Idempotent,
# so it can be run directly on a test VM to validate before a Packer build.
#
# Status output on every step (img-generalize.ps1 style) and Stop-on-error:
# a failed hardening setting now FAILS THE BUILD LOUDLY instead of passing
# silently - a PAW security baseline must hold, not half-apply.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Phase([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

Write-Phase "Disable SMB1"
Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force
Write-Host "  SMB1 disabled (optional feature + server configuration)"

Write-Phase "Block insecure SMB guest authentication"
Set-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation" -Name AllowInsecureGuestAuth -Value 0
Write-Host "  AllowInsecureGuestAuth = 0"

Write-Phase "Disable multicast DNS (LLMNR)"
New-Item -Path "HKLM:\Software\Policies\Microsoft\Windows NT\DNSClient" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\Software\Policies\Microsoft\Windows NT\DNSClient" -Name EnableMulticast -Value 0
Write-Host "  DNSClient EnableMulticast = 0"

Write-Phase "Defender: cloud protection, sample submission, PUA, ASR"
Set-MpPreference -DisableRealtimeMonitoring $false -MAPSReporting Advanced -SubmitSamplesConsent SendAllSamples
Write-Host "  Realtime = enabled, MAPS = Advanced, samples = SendAllSamples"
Set-MpPreference -PUAProtection Enabled
Write-Host "  PUA protection = Enabled"
Set-MpPreference -AttackSurfaceReductionRules_Ids D4F940AB-401B-4EFC-AADC-AD5F3C50688A -AttackSurfaceReductionRules_Actions Enabled
Write-Host "  ASR rule D4F940AB... = Enabled"

# Delivery Optimization: HTTP-only downloads from Microsoft sources, no
# peer-to-peer. Keeps Windows Update working inside the locked-down PAW
# (egress allow-list covers AzureCloud) without P2P traffic.
Write-Phase "Delivery Optimization: HTTP-only mode"
New-Item -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization" -Force | Out-Null
Set-ItemProperty -Path "HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization" -Name DODownloadMode -Value 0 -Type DWord
Write-Host "  DODownloadMode = 0 (HTTP only, no P2P)"

Write-Host "PAW HARDENING COMPLETE" -ForegroundColor Green