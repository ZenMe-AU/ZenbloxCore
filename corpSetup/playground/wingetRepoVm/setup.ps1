# Installs Winget-Repo on this VM as an autostart Task Scheduler job.
# Run via Azure run-command (see README.md) or manually on the VM.

[CmdletBinding()]
param(
    # Optional: base64 of a pre-generated TLS pair (cert.pem / key.pem).
    # If omitted, Winget-Repo auto-generates a 365-day localhost pair on
    # first start.
    [string]$certB64 = '',
    [string]$keyB64 = ''
)

$ErrorActionPreference = 'Stop'
$repoDir = 'C:\Winget-Repo'
$toolsDir = 'C:\Tools'
$pythonExe = 'C:\Program Files\Python312\python.exe'

New-Item -ItemType Directory -Force -Path $repoDir, $toolsDir | Out-Null

# 1. Python 3.12 (all users, on PATH)
if (-not (Test-Path $pythonExe)) {
    Invoke-WebRequest -Uri 'https://www.python.org/ftp/python/3.12.10/python-3.12.10-amd64.exe' -OutFile "$toolsDir\python-installer.exe" -UseBasicParsing
    $p = Start-Process -FilePath "$toolsDir\python-installer.exe" -ArgumentList '/quiet','InstallAllUsers=1','PrependPath=1','Include_test=0' -Wait -PassThru
    if ($p.ExitCode -ne 0) { throw "Python installer exited $($p.ExitCode)" }
}

# 2. Winget-Repo V2.9.2 (pinned - same version as the reference install)
if (-not (Test-Path "$repoDir\main.py")) {
    Invoke-WebRequest -Uri 'https://github.com/dev-fYnn/Winget-Repo/archive/refs/tags/V2.9.2.zip' -OutFile "$toolsDir\wingetrepo.zip" -UseBasicParsing
    Expand-Archive -Path "$toolsDir\wingetrepo.zip" -DestinationPath "$toolsDir\wr-extract" -Force
    $inner = Get-ChildItem "$toolsDir\wr-extract" -Directory | Select-Object -First 1
    Get-ChildItem $inner.FullName | Move-Item -Destination $repoDir
}

# 3. Dependencies
& $pythonExe -m pip install --no-warn-script-location -r "$repoDir\requirements.txt"
if ($LASTEXITCODE -ne 0) { throw 'pip install failed' }

# 4. TLS pair (optional override - the app reuses existing pairs as-is)
if ($certB64 -and $keyB64) {
    New-Item -ItemType Directory -Force -Path "$repoDir\Config\SSL" | Out-Null
    [IO.File]::WriteAllText("$repoDir\Config\SSL\cert.pem", [Text.Encoding]::ASCII.GetString([Convert]::FromBase64String($certB64)))
    [IO.File]::WriteAllText("$repoDir\Config\SSL\key.pem", [Text.Encoding]::ASCII.GetString([Convert]::FromBase64String($keyB64)))
}

# 5. Autostart via Task Scheduler (NOT NSSM: nssm.cc returns 503 from Azure ranges)
$action = New-ScheduledTaskAction -Execute $pythonExe -Argument "$repoDir\main.py /docker" -WorkingDirectory $repoDir
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest
$trigger = New-ScheduledTaskTrigger -AtStartup
Register-ScheduledTask -TaskName 'WingetRepo' -Action $action -Trigger $trigger -Principal $principal | Out-Null

# 6. Firewall
New-NetFirewallRule -DisplayName 'WingetRepo-5000' -Direction Inbound -Protocol TCP -LocalPort 5000 -Action Allow | Out-Null

# 7. Start + smoke test
Start-ScheduledTask -TaskName 'WingetRepo'
Start-Sleep -Seconds 20
$listen = ($null -ne (Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue))
Write-Host ("Listening on 5000: " + $listen)
$status = & curl.exe -k -s -o NUL -w '%{http_code}' 'https://localhost:5000'
Write-Host "HTTPS localhost:5000 status: $status"