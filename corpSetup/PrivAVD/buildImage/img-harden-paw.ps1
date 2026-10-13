#requires -RunAsAdministrator
# Baseline PAW hardening applied during the golden image build. Idempotent,
# so it can be run directly on a test VM to validate before a Packer build.

Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart
Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force

Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Services\LanmanWorkstation' -Name AllowInsecureGuestAuth -Value 0

New-Item -Path 'HKLM:\Software\Policies\Microsoft\Windows NT\DNSClient' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\Software\Policies\Microsoft\Windows NT\DNSClient' -Name EnableMulticast -Value 0

Set-MpPreference -DisableRealtimeMonitoring $false -MAPSReporting Advanced -SubmitSamplesConsent SendAllSamples
Set-MpPreference -PUAProtection Enabled
Set-MpPreference -AttackSurfaceReductionRules_Ids D4F940AB-401B-4EFC-AADC-AD5F3C50688A -AttackSurfaceReductionRules_Actions Enabled

# Delivery Optimization: HTTP-only downloads from Microsoft sources, no
# peer-to-peer. Keeps Windows Update working inside the locked-down PAW
# (egress allow-list covers AzureCloud) without P2P traffic.
New-Item -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' -Force | Out-Null
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Policies\Microsoft\Windows\DeliveryOptimization' -Name DODownloadMode -Value 0 -Type DWord