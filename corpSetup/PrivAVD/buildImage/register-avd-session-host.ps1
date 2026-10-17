#requires -RunAsAdministrator

param(
    [Parameter(Mandatory)]
    [string] $RegistrationTokenBase64
)

$ErrorActionPreference = "Stop"
$packageDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path

function Test-InstalledApplication {
    param([Parameter(Mandatory)] [string] $DisplayName)

    $uninstallPaths = @(
        "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
        "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
    )

    return $null -ne (Get-ItemProperty $uninstallPaths -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -eq $DisplayName } |
        Select-Object -First 1)
}

function Install-Msi {
    param(
        [Parameter(Mandatory)] [string] $Path,
        [string[]] $Properties = @()
    )

    $signature = Get-AuthenticodeSignature -FilePath $Path
    if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Microsoft Corporation") {
        throw "AVD installer does not have a valid Microsoft signature: $Path"
    }

    $arguments = @("/i", "`"$Path`"", "/quiet", "/norestart") + $Properties
    $process = Start-Process -FilePath "msiexec.exe" -ArgumentList $arguments -Wait -PassThru
    if ($process.ExitCode -notin @(0, 1641, 3010)) {
        throw "AVD installer failed with exit code $($process.ExitCode): $Path"
    }
}

$agentInstalled = Test-InstalledApplication "Remote Desktop Services Infrastructure Agent"
$bootLoaderInstalled = Test-InstalledApplication "Remote Desktop Agent Boot Loader"
if ($agentInstalled -and $bootLoaderInstalled) {
    Write-Host "The AVD agent and boot loader are already installed."
    return
}

$agentInstaller = Join-Path $packageDirectory "Microsoft.RDInfra.RDAgent.Installer-x64.msi"
$bootLoaderInstaller = Join-Path $packageDirectory "Microsoft.RDInfra.RDAgentBootLoader.Installer-x64.msi"

if (-not $agentInstalled) {
    $registrationToken = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($RegistrationTokenBase64))
    Install-Msi -Path $agentInstaller -Properties @("REGISTRATIONTOKEN=$registrationToken")
}

if (-not $bootLoaderInstalled) {
    Install-Msi -Path $bootLoaderInstaller
}