# Runs hidden at every user sign-in on a PAW session host (HKLM Run key ->
# paw-signin.vbs -> this script), as the signed-in user.
#   1. Maps the Artifact Keeper read-only share to a drive letter (P:). The
#      share needs the user's cloud Kerberos ticket, which is not ready at the
#      first moment of sign-in, so it retries. Not persistent: a saved mapping
#      would try to reconnect before the ticket exists and fail.
#   2. Installs the developer tools for this user (Install-PawUserTools.ps1),
#      when switched on.
# Settings: paw-signin.json next to this script (written by deployPaw).
# Log: %LOCALAPPDATA%\Zenblox\logs\paw-signin.log.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$config = Get-Content (Join-Path $here 'paw-signin.json') -Raw | ConvertFrom-Json

$logDir = Join-Path $env:LOCALAPPDATA 'Zenblox\logs'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$logFile = Join-Path $logDir 'paw-signin.log'
if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 512KB) { Move-Item $logFile "$logFile.old" -Force }
function Write-Log([string] $Message) {
    Add-Content -Path $logFile -Encoding UTF8 -Value ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message)
}

Write-Log "=== sign-in: $env:USERNAME, share $($config.shareRoot)"

if ($config.driveLetter) {
    $drive = ($config.driveLetter.TrimEnd(':')) + ':'   # e.g. P:
    $mapped = $false
    for ($i = 1; $i -le 12 -and -not $mapped; $i++) {
        $existing = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$drive'" -ErrorAction SilentlyContinue
        if ($existing -and $existing.ProviderName -ieq $config.shareRoot) {
            $mapped = $true
            break
        }
        if ($existing) { & net.exe use $drive /delete /y 2>&1 | Out-Null }
        $out = & net.exe use $drive $config.shareRoot /persistent:no 2>&1
        if ($LASTEXITCODE -eq 0) { $mapped = $true }
        else {
            Write-Log "map $drive attempt ${i}: $(($out | Where-Object { $_ }) -join ' ')"
            Start-Sleep -Seconds 15
        }
    }
    Write-Log $(if ($mapped) { "map $drive OK" } else { "map $drive FAILED after 12 attempts" })
}

if ($config.userTools) {
    & (Join-Path $here 'Install-PawUserTools.ps1') -ShareRoot $config.shareRoot | Out-Null
    Write-Log "user tools: exit $LASTEXITCODE (details in paw-user-tools.log)"
}
