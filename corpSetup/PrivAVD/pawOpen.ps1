[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Reverses pawLockdown.ps1: deletes the lockdown NSG rules and the private
# endpoint. Internet egress, Windows Update and the AVD agent update path are
# restored. The private-endpoints subnet, DNS zone and VNet link are kept
# (they cost nothing); delete them manually if you want a fully clean slate.
# If the stack was DEPLOYED with TF_VAR_LOCKDOWN=true, a later terraform
# apply will re-create the lockdown resources - prefer flipping that env
# value and re-applying instead of this script in that case.

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$envFile = Join-Path $scriptDirectory '.env'

function Import-DotEnv {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path)) {
        throw "Environment file was not found: $Path"
    }
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if (-not $line -or $line.StartsWith('#')) { return }
        $parts = $line -split '=', 2
        if ($parts.Count -ne 2) { return }
        [Environment]::SetEnvironmentVariable($parts[0].Trim(), $parts[1].Trim(), 'Process')
    }
}

function Get-RequiredEnvironmentVariable {
    param([string]$Name)
    $value = [Environment]::GetEnvironmentVariable($Name, 'Process')
    if (-not $value) { throw "Required PAW setting '$Name' is missing from the .env file." }
    return $value
}

function Test-AzResource {
    $null = & az @args 2>$null
    return ($LASTEXITCODE -eq 0)
}

Write-Host 'Loading .env ...' -ForegroundColor Gray
Import-DotEnv -Path $envFile
$subscriptionId = Get-RequiredEnvironmentVariable -Name 'TF_VAR_SUBSCRIPTION_ID'
$hostPoolName   = Get-RequiredEnvironmentVariable -Name 'TF_VAR_HOST_POOL_NAME'
$rgName         = "$hostPoolName-rg"

$vnetName = & az network vnet list -g $rgName --query '[0].name' -o tsv 2>$null
if ($LASTEXITCODE -ne 0 -or -not "$vnetName".Trim()) {
    throw "Cannot read resource group $rgName. Run az logout and az login (with MFA) first, then rerun this script."
}
$nsgName = "$($hostPoolName)-session-hosts-nsg"
$liveNsg = & az network nsg list -g $rgName --query '[0].name' -o tsv 2>$null
if ($LASTEXITCODE -eq 0 -and "$liveNsg".Trim()) { $nsgName = "$liveNsg".Trim() }

# 1. Delete the 5 lockdown NSG rules.
$ruleNames = @(
    'LockdownAllow-PrivateEndpoint',
    'LockdownAllow-EntraAuth',
    'LockdownAllow-AvdAgent',
    'LockdownAllow-AzureDns',
    'LockdownDeny-InternetOutbound'
)
foreach ($name in $ruleNames) {
    if (Test-AzResource network nsg rule show -g $rgName --nsg-name $nsgName -n $name) {
        Write-Host "Deleting NSG rule: $name" -ForegroundColor Cyan
        & az network nsg rule delete -g $rgName --nsg-name $nsgName -n $name -o none 2>$null
        if ($LASTEXITCODE -ne 0) { throw "Failed to delete NSG rule $name. If the error mentioned MFA or a claims challenge, run the az login command it printed, then rerun this script." }
    } else {
        Write-Host "NSG rule not present (already removed): $name" -ForegroundColor Gray
    }
}

# 2. Delete the private endpoint (the only resource with real cost).
$peName = "$hostPoolName-lockdown-pe"
if (Test-AzResource network private-endpoint show -g $rgName -n $peName) {
    Write-Host "Deleting private endpoint $peName ..." -ForegroundColor Cyan
    & az network private-endpoint delete -g $rgName -n $peName -o none 2>$null
    if ($LASTEXITCODE -ne 0) { throw "Failed to delete the private endpoint. If the error mentioned MFA or a claims challenge, run the az login command it printed, then rerun this script." }
} else {
    Write-Host 'Private endpoint not present (already removed).' -ForegroundColor Gray
}

Write-Host ''
Write-Host 'Lockdown removed.' -ForegroundColor Green
Write-Host '  - Internet egress, Windows Update and AVD agent updates restored'
Write-Host '  - Kept (free of charge): private-endpoints subnet, DNS zone, VNet link'
Write-Host ''
Write-Host 'Run .\pawLockdown.ps1 to lock down again.'