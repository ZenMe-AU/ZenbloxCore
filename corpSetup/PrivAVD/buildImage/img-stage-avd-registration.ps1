#requires -RunAsAdministrator
# Stages the AVD session-host registration materials into the image:
# the register script plus the current Microsoft-signed AVD Agent and
# Boot Loader installers. The MSIs are NOT installed at build time -
# they run after deployment with a host-pool registration token.
#
# Status output on every step (img-generalize.ps1 style) so a silent
# freeze in the Packer log is always attributable to a named phase.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

function Write-Phase([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

$destination = "C:\ProgramData\PAW\AvdRegistration"

Write-Phase "Staging AVD registration folder"
New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item "C:\Windows\Temp\register-avd-session-host.ps1" $destination -Force
Write-Host "  Staged: $destination\register-avd-session-host.ps1"

$installers = @{
    "Microsoft.RDInfra.RDAgent.Installer-x64.msi"           = "https://go.microsoft.com/fwlink/?linkid=2310011"
    "Microsoft.RDInfra.RDAgentBootLoader.Installer-x64.msi" = "https://go.microsoft.com/fwlink/?linkid=2311028"
}

foreach ($installer in $installers.GetEnumerator()) {
    $name = $installer.Key
    $path = Join-Path $destination $name

    Write-Phase "Downloading $name"
    $downloadStart = Get-Date
    try {
        # 5-minute cap: a hung download fails the build loudly instead of
        # freezing the Packer log forever with no output.
        Invoke-WebRequest -Uri $installer.Value -UseBasicParsing -OutFile $path -TimeoutSec 300
        Unblock-File -Path $path
        $sizeMb = [math]::Round((Get-Item $path).Length / 1MB, 1)
        $seconds = [int]((Get-Date) - $downloadStart).TotalSeconds
        Write-Host "  Downloaded ${sizeMb} MB in ${seconds}s"
    } catch {
        throw "Download failed for $name ($($installer.Value)): $_"
    }

    Write-Phase "Verifying signature: $name"
    $signature = Get-AuthenticodeSignature -FilePath $path
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
        throw "Downloaded AVD installer does not have a valid Microsoft signature: $path (status: $($signature.Status))"
    }
    Write-Host "  Signature OK: $($signature.SignerCertificate.Subject)"
}

Write-Phase "Cleaning up upload temp file"
Remove-Item "C:\Windows\Temp\register-avd-session-host.ps1" -Force

Write-Host "AVD REGISTRATION STAGING COMPLETE" -ForegroundColor Green