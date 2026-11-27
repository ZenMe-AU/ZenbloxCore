# Installs the PAW sign-in tasks on a session host (machine-wide, run as
# SYSTEM by deployPaw's azurerm_virtual_machine_run_command). Idempotent.
#
# Writes C:\ProgramData\Zenblox\PawSignIn\ (read-only for users):
#   Invoke-PawSignIn.ps1     - runs at every sign-in as the user: maps the
#                              Artifact Keeper share, installs the user tools
#   Install-PawUserTools.ps1 - per-user tool install from the share
#   paw-signin.vbs           - starts the above hidden (no console flash)
#   paw-signin.json          - settings (share, drive letter, tools on/off)
# and starts paw-signin.vbs from the HKLM Run key (value ZenbloxPawSignIn).
# Scheduled-task principals do not work for "every user" on AVD multi-session
# hosts; the Run key does.
#
# With user tools on, also sets the machine policies the tools need on a PAW
# without internet: VS Code updates and telemetry off, Windows long paths on.
#
# Inputs are variables defined above this script by deployPaw (session_hosts.tf),
# not a param() block, because the two user scripts travel inside the run
# command as base64 text:
#   $ZbShareRoot   \\<account>.file.core.windows.net\<share>
#   $ZbDriveLetter drive letter for the share, '' = do not map
#   $ZbUserTools   'true' / 'false'
#   $ZbFiles       @{ '<file name>' = '<base64 content>'; ... }
$ErrorActionPreference = 'Stop'

foreach ($name in 'ZbShareRoot', 'ZbDriveLetter', 'ZbUserTools', 'ZbFiles') {
    if ($null -eq (Get-Variable -Name $name -ValueOnly -ErrorAction SilentlyContinue)) { throw "input `$$name is not set" }
}
if ($ZbShareRoot -notmatch '^\\\\[^\\]+\\[^\\]+$') { throw "ShareRoot must look like \\host\share, got '$ZbShareRoot'" }
$userTools = $ZbUserTools -eq 'true'

$dir = Join-Path $env:ProgramData 'Zenblox\PawSignIn'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
# ProgramData lets standard users create files in subfolders; this folder holds
# code every user runs, so only SYSTEM and Administrators may change it.
& icacls.exe $dir /inheritance:r /grant:r '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' '*S-1-5-32-545:(OI)(CI)RX' | Out-Null
if ($LASTEXITCODE -ne 0) { throw "icacls failed on $dir" }

foreach ($file in $ZbFiles.Keys) {
    [IO.File]::WriteAllBytes((Join-Path $dir $file), [Convert]::FromBase64String($ZbFiles[$file]))
    Write-Output "wrote $file"
}

$vbs = 'CreateObject("WScript.Shell").Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""' + (Join-Path $dir 'Invoke-PawSignIn.ps1') + '""", 0, False'
Set-Content -Path (Join-Path $dir 'paw-signin.vbs') -Value $vbs -Encoding ASCII

[pscustomobject]@{ shareRoot = $ZbShareRoot; driveLetter = $ZbDriveLetter; userTools = $userTools } |
    ConvertTo-Json | Set-Content -Path (Join-Path $dir 'paw-signin.json') -Encoding ASCII
Write-Output "settings: share $ZbShareRoot, drive '$ZbDriveLetter', user tools $userTools"

# Set-ItemProperty only: New-Item -Force on an existing key wipes its values.
Set-ItemProperty -Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Run' -Name 'ZenbloxPawSignIn' -Value ('wscript.exe "' + (Join-Path $dir 'paw-signin.vbs') + '"')
Write-Output 'Run key ZenbloxPawSignIn: set'

if ($userTools) {
    $vscode = 'HKLM:\SOFTWARE\Policies\Microsoft\VSCode'
    if (-not (Test-Path $vscode)) { New-Item -Path $vscode -Force | Out-Null }
    Set-ItemProperty -Path $vscode -Name 'UpdateMode' -Value 'none' -Type String
    Set-ItemProperty -Path $vscode -Name 'TelemetryLevel' -Value 'off' -Type String
    Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -Type DWord
    Write-Output 'VS Code policy: updates none, telemetry off; long paths on'
}
