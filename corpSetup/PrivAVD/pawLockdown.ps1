[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

# Locks the deployed PAW session host down to AVD-control-plane-only egress.
# Creates: private-endpoints subnet, hostpool-connection private endpoint,
# privatelink.wvd.microsoft.com private DNS zone + VNet link, and 5 NSG rules.
# Windows Update, Edge and all other internet egress stop working until
# pawOpen.ps1 is run. Idempotent: safe to rerun.
# Reverse with pawOpen.ps1.
# NOTE: if this stack was DEPLOYED with TF_VAR_LOCKDOWN=true, a later
# terraform apply re-creates the lockdown; prefer flipping that env value
# and re-applying instead of this script in that case.

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

# Runs az with the remaining arguments; returns trimmed stdout.
function Invoke-Az {
    $out = & az @args 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "az $($args -join ' ') failed. If the error mentioned MFA or a claims challenge, run the az login command it printed, then rerun this script."
    }
    return "$out".Trim()
}

# Runs az with the remaining arguments; returns true when the resource exists.
function Test-AzResource {
    $null = & az @args 2>$null
    return ($LASTEXITCODE -eq 0)
}

Write-Host 'Loading .env ...' -ForegroundColor Gray
Import-DotEnv -Path $envFile
$subscriptionId = Get-RequiredEnvironmentVariable -Name 'TF_VAR_SUBSCRIPTION_ID'
$hostPoolName   = Get-RequiredEnvironmentVariable -Name 'TF_VAR_HOST_POOL_NAME'
$rgName         = "$hostPoolName-rg"

Write-Host "Resource group: $rgName" -ForegroundColor Gray
if (-not (Test-AzResource group show -g $rgName --query id -o tsv)) {
    throw "Cannot read resource group $rgName. Run az logout and az login (with MFA) first, then rerun this script."
}

# Refuse to lock while someone is signed in unless -Force.
$sessionHostsUrl = "https://management.azure.com/subscriptions/$subscriptionId/resourceGroups/$rgName/providers/Microsoft.DesktopVirtualization/hostPools/$hostPoolName/sessionhosts?api-version=2023-09-05"
$sessionsJson = & az rest --method get --url $sessionHostsUrl --query 'value[].properties.sessions' -o json 2>$null
if ($LASTEXITCODE -eq 0 -and $sessionsJson) {
    $sessions = ($sessionsJson | ConvertFrom-Json | Measure-Object -Sum).Sum
    if (-not $sessions) { $sessions = 0 }
    if ($sessions -gt 0 -and -not $Force) {
        throw "$sessions active session(s) on the host pool. Lockdown would disrupt them. Wait for them to end or rerun with -Force."
    }
}

# Discovery: resolve names from live state instead of assuming.
$vnetName   = Invoke-Az network vnet list -g $rgName --query '[0].name' -o tsv
$nsgName    = Invoke-Az network nsg list -g $rgName --query '[0].name' -o tsv
$rgLocation = Invoke-Az group show -g $rgName --query location -o tsv
$vnetId     = Invoke-Az network vnet show -g $rgName -n $vnetName --query id -o tsv
if (-not $vnetName -or -not $nsgName) { throw "Could not discover the VNet or NSG in $rgName." }
$hostPoolId = "/subscriptions/$subscriptionId/resourceGroups/$rgName/providers/Microsoft.DesktopVirtualization/hostPools/$hostPoolName"
Write-Host "VNet: $vnetName | NSG: $nsgName | Location: $rgLocation" -ForegroundColor Gray

# 1. Private-endpoints subnet (kept by pawOpen, it is free).
$peSubnetName = 'private-endpoints'
$peSubnetPrefix = '10.250.2.0/26'
if (Test-AzResource network vnet subnet show -g $rgName --vnet-name $vnetName -n $peSubnetName) {
    $peSubnetPrefix = Invoke-Az network vnet subnet show -g $rgName --vnet-name $vnetName -n $peSubnetName --query 'addressPrefix[0]' -o tsv
    Write-Host "Subnet $peSubnetName exists ($peSubnetPrefix)." -ForegroundColor Gray
} else {
    Write-Host "Creating subnet $peSubnetName ($peSubnetPrefix) ..." -ForegroundColor Cyan
    $null = Invoke-Az network vnet subnet create -g $rgName --vnet-name $vnetName -n $peSubnetName --address-prefixes $peSubnetPrefix -o none
}
$peSubnetId = Invoke-Az network vnet subnet show -g $rgName --vnet-name $vnetName -n $peSubnetName --query id -o tsv

# 2. Private DNS zone + VNet link (kept by pawOpen, free).
$zoneName = 'privatelink.wvd.microsoft.com'
if (-not (Test-AzResource network private-dns zone show -g $rgName -n $zoneName)) {
    Write-Host "Creating private DNS zone $zoneName ..." -ForegroundColor Cyan
    $null = Invoke-Az network private-dns zone create -g $rgName -n $zoneName -o none
}
$linkName = "$vnetName-link"
if (-not (Test-AzResource network private-dns link vnet show -g $rgName -z $zoneName -n $linkName)) {
    Write-Host "Creating VNet link $linkName ..." -ForegroundColor Cyan
    $null = Invoke-Az network private-dns link vnet create -g $rgName -z $zoneName -n $linkName -v $vnetId -e False -o none
}
$zoneId = Invoke-Az network private-dns zone show -g $rgName -n $zoneName --query id -o tsv

# 3. Private endpoint to the host pool connection sub-resource.
$peName = "$hostPoolName-lockdown-pe"
if (-not (Test-AzResource network private-endpoint show -g $rgName -n $peName)) {
    Write-Host "Creating private endpoint $peName ..." -ForegroundColor Cyan
    $null = Invoke-Az network private-endpoint create -g $rgName -n $peName -l $rgLocation --subnet $peSubnetId --private-connection-resource-id $hostPoolId --connection-name "$hostPoolName-conn" --group-id connection -o none
}
$peId = Invoke-Az network private-endpoint show -g $rgName -n $peName --query id -o tsv
$peIp = Invoke-Az network private-endpoint show -g $rgName -n $peName --query 'ipConfigurations[0].privateIpAddress' -o tsv

# 4. Attach the zone to the endpoint so its FQDNs resolve to the private IP.
$zoneGroupBody = @{
    properties = @{
        privateDnsZoneConfigs = @(
            @{ name = 'wvd'; properties = @{ privateDnsZoneId = $zoneId } }
        )
    }
} | ConvertTo-Json -Depth 6
Write-Host 'Attaching DNS zone group ...' -ForegroundColor Cyan
$null = az rest --method put --url "$peId/privateDnsZoneGroups/default?api-version=2024-03-01" --body $zoneGroupBody -o none 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Could not attach the private DNS zone group. If the error mentioned MFA or a claims challenge, run the az login command it printed, then rerun this script."
}

# 5. NSG allow-list + deny (exact reverse of what pawOpen.ps1 deletes).
$rules = @(
    @{ name = 'LockdownAllow-PrivateEndpoint'; priority = 100;  access = 'Allow'; protocol = 'Tcp'; ports = '443'; dest = $peSubnetPrefix },
    @{ name = 'LockdownAllow-EntraAuth';       priority = 110;  access = 'Allow'; protocol = '*';   ports = '*';   dest = 'AzureActiveDirectory' },
    @{ name = 'LockdownAllow-AvdAgent';        priority = 120;  access = 'Allow'; protocol = 'Tcp'; ports = '443'; dest = 'WindowsVirtualDesktop' },
    @{ name = 'LockdownAllow-AzureDns';        priority = 130;  access = 'Allow'; protocol = '*';   ports = '53';  dest = 'AzureDNS' },
    @{ name = 'LockdownDeny-InternetOutbound'; priority = 4090; access = 'Deny';  protocol = '*';   ports = '*';   dest = 'Internet' }
)
foreach ($r in $rules) {
    Write-Host ("NSG rule: " + $r.name) -ForegroundColor Cyan
    $null = Invoke-Az network nsg rule create -g $rgName --nsg-name $nsgName -n $r.name --priority $r.priority --direction Outbound --access $r.access --protocol $r.protocol --source-port-range '*' --destination-port-range $r.ports --source-address-prefix VirtualNetwork --destination-address-prefix $r.dest -o none
}

# 6. Show the DNS records the endpoint registered (the verification handle).
Write-Host ''
Write-Host 'Registered private DNS records:' -ForegroundColor Gray
$records = & az network private-dns record-set a list -g $rgName -z $zoneName --query '[].{fqdn:fqdn, ip:aRecords[0].ipv4Address}' -o tsv 2>$null
if ($LASTEXITCODE -eq 0 -and $records) { $records | ForEach-Object { Write-Host "  $_" } }

Write-Host ''
Write-Host 'Lockdown active.' -ForegroundColor Green
Write-Host "  - AVD broker/gateway traffic: private endpoint $peIp"
Write-Host '  - Entra ID sign-in: allowed (your client sign-in flow is unchanged)'
Write-Host '  - Windows Update, Edge, general internet: blocked'
Write-Host ''
Write-Host 'Known limitations while locked: Windows/AVD agent updates and'
Write-Host 'Windows activation renewals cannot reach the internet. Run'
Write-Host '.\pawOpen.ps1 to update, then lock down again.'