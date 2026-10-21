#requires -RunAsAdministrator
# Waits for the Azure guest agents to come up, then syspreps the VM so
# Packer can capture it as a generalized managed image. Only meaningful
# on an Azure VM; running elsewhere will hang on the agent wait loops.
#
# Every phase prints status so a Packer log shows exactly where things are.
# The sysprep polling loop has a 30-minute timeout — if sysprep hangs, the
# script dumps the ImageState and running services before failing loudly.

$ErrorActionPreference = 'Continue'

function Write-Phase([string]$message) {
    Write-Host ">> $message" -ForegroundColor Cyan
}

# --- Phase 1: Wait for RdAgent ---
Write-Phase 'Waiting for RdAgent service...'
$rdAgentTimeout = 300  # 5 minutes
$rdAgentElapsed = 0
while ((Get-Service RdAgent -ErrorAction SilentlyContinue).Status -ne 'Running') {
    Start-Sleep -Seconds 5
    $rdAgentElapsed += 5
    if ($rdAgentElapsed -ge $rdAgentTimeout) {
        $svc = Get-Service RdAgent -ErrorAction SilentlyContinue
        Write-Host "  RdAgent status: $($svc.Status) after $rdAgentElapsed seconds" -ForegroundColor Yellow
        Write-Host "  RdAgent may be starting up; continuing anyway..." -ForegroundColor Yellow
        break
    }
    if ($rdAgentElapsed % 30 -eq 0) {
        Write-Host "  RdAgent: waiting... ($rdAgentElapsed seconds elapsed)"
    }
}
Write-Host "  RdAgent: $((Get-Service RdAgent -ErrorAction SilentlyContinue).Status)"

# --- Phase 2: Wait for WindowsAzureGuestAgent ---
Write-Phase 'Waiting for WindowsAzureGuestAgent service...'
$guestAgentTimeout = 300
$guestAgentElapsed = 0
while ((Get-Service WindowsAzureGuestAgent -ErrorAction SilentlyContinue).Status -ne 'Running') {
    Start-Sleep -Seconds 5
    $guestAgentElapsed += 5
    if ($guestAgentElapsed -ge $guestAgentTimeout) {
        $svc = Get-Service WindowsAzureGuestAgent -ErrorAction SilentlyContinue
        Write-Host "  WindowsAzureGuestAgent status: $($svc.Status) after $guestAgentElapsed seconds" -ForegroundColor Yellow
        Write-Host "  Continuing anyway..." -ForegroundColor Yellow
        break
    }
    if ($guestAgentElapsed % 30 -eq 0) {
        Write-Host "  WindowsAzureGuestAgent: waiting... ($guestAgentElapsed seconds elapsed)"
    }
}
Write-Host "  WindowsAzureGuestAgent: $((Get-Service WindowsAzureGuestAgent -ErrorAction SilentlyContinue).Status)"

# --- Phase 3: Stop any services that could block sysprep ---
Write-Phase 'Pre-sysprep cleanup (stop services that could block generalization)'

# Stop the WingetRepo scheduled task if still registered
$task = Get-ScheduledTask -TaskName 'WingetRepo' -ErrorAction SilentlyContinue
if ($task -and $task.State -eq 'Running') {
    Write-Host '  Stopping WingetRepo task...'
    Stop-ScheduledTask -TaskName 'WingetRepo' -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
}
if ($task) {
    Write-Host "  WingetRepo task state: $($task.State)"
}

# Kill any lingering python processes (they can block sysprep)
$pythonProcs = Get-Process -Name python -ErrorAction SilentlyContinue
if ($pythonProcs) {
    Write-Host "  Killing $($pythonProcs.Count) python process(es)..."
    $pythonProcs | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

# Check for pending reboot (a pending reboot blocks sysprep)
$pendingReboot = $false
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Component Based Servicing\RebootPending') {
    $pendingReboot = $true
    Write-Host '  WARNING: CBS RebootPending flag is set - sysprep may hang!' -ForegroundColor Red
}
if (Test-Path 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\WindowsUpdate\Auto Update\RebootRequired') {
    $pendingReboot = $true
    Write-Host '  WARNING: WindowsUpdate RebootRequired flag is set - sysprep may hang!' -ForegroundColor Red
}
if ($pendingReboot) {
    Write-Host '  Pending reboot detected. Attempting sysprep anyway (may fail)...' -ForegroundColor Yellow
} else {
    Write-Host '  No pending reboot flags. Good.'
}

# List any non-standard running services that could block sysprep
$runningServices = Get-Service | Where-Object {
    $_.Status -eq 'Running' -and
    $_.Name -notin @(
        'RdAgent', 'WindowsAzureGuestAgent', 'Telemetry',
        'Appinfo', 'BFE', 'BrokerInfrastructure', 'CDPSvc',
        'CoreMessagingRegistrar', 'CryptSvc', 'DcomLaunch',
        'Dhcp', 'Dnscache', 'EventLog', 'EventSystem',
        'FontCache', 'LanmanServer', 'LanmanWorkstation',
        'mpssvc', 'netprofm', 'NlaSvc', 'nsi', 'PlugPlay',
        'Power', 'ProfSvc', 'RpcSs', 'SamSs', 'Schedule',
        'SENS', 'Spooler', 'SystemEventsBroker', 'Themes',
        'W32Time', 'Wcmsvc', 'WinDefend', 'Winmgmt',
        'WpnService', 'wuauserv', 'WSearch'
    )
}
if ($runningServices) {
    Write-Host "  Non-standard running services (${($runningServices.Count)}):"
    foreach ($svc in $runningServices) {
        Write-Host "    $($svc.Name): $($svc.DisplayName)"
    }
}

# --- Phase 4: Run sysprep ---
Write-Phase 'Running sysprep /generalize...'
$sysprepStart = Get-Date

& $env:SystemRoot\System32\Sysprep\Sysprep.exe /oobe /generalize /quiet /quit /mode:vm

# --- Phase 5: Wait for ImageState (with 30-minute timeout) ---
Write-Phase 'Waiting for sysprep to complete (timeout: 30 minutes)...'
$sysprepTimeoutSeconds = 1800  # 30 minutes
$sysprepElapsed = 0

while ($true) {
    $imageState = (Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Setup\State' -ErrorAction SilentlyContinue).ImageState
    $sysprepElapsed = [int]((Get-Date) - $sysprepStart).TotalSeconds

    if ($imageState -eq 'IMAGE_STATE_GENERALIZE_RESEAL_TO_OOBE') {
        Write-Host "  Sysprep completed in $sysprepElapsed seconds. ImageState: $imageState" -ForegroundColor Green
        break
    }

    if ($sysprepElapsed -ge $sysprepTimeoutSeconds) {
        Write-Host "  TIMEOUT: sysprep did not complete in $sysprepTimeoutSeconds seconds!" -ForegroundColor Red
        Write-Host "  Current ImageState: $imageState"
        Write-Host "  Sysprep log tail:"
        $sysprepLog = 'C:\Windows\System32\Sysprep\Panther\setupact.log'
        if (Test-Path $sysprepLog) {
            Get-Content $sysprepLog -Tail 30 | ForEach-Object { Write-Host "    $_" }
        }
        $sysprepErrLog = 'C:\Windows\System32\Sysprep\Panther\setuperr.log'
        if (Test-Path $sysprepErrLog) {
            Write-Host "  Sysprep error log tail:"
            Get-Content $sysprepErrLog -Tail 30 | ForEach-Object { Write-Host "    $_" }
        }
        throw "Sysprep timed out after $sysprepTimeoutSeconds seconds. ImageState: $imageState"
    }

    if ($sysprepElapsed % 30 -eq 0) {
        Write-Host "  Sysprep: $sysprepElapsed seconds elapsed, ImageState: $imageState"
    }

    Start-Sleep -Seconds 5
}

Write-Phase 'Sysprep completed successfully'