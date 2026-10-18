#requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$destination = "C:\ProgramData\PAW\AvdRegistration"

New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item "C:\Windows\Temp\register-avd-session-host.ps1" $destination -Force

$installers = @{
    "Microsoft.RDInfra.RDAgent.Installer-x64.msi"           = "https://go.microsoft.com/fwlink/?linkid=2310011"
    "Microsoft.RDInfra.RDAgentBootLoader.Installer-x64.msi" = "https://go.microsoft.com/fwlink/?linkid=2311028"
}

foreach ($installer in $installers.GetEnumerator()) {
    $path = Join-Path $destination $installer.Key
    Invoke-WebRequest -Uri $installer.Value -UseBasicParsing -OutFile $path
    Unblock-File -Path $path

    $signature = Get-AuthenticodeSignature -FilePath $path
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
        throw "Downloaded AVD installer does not have a valid Microsoft signature: $path"
    }
}

Remove-Item "C:\Windows\Temp\register-avd-session-host.ps1" -Force