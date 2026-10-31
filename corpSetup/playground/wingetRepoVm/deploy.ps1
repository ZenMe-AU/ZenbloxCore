# Deploys the Winget-Repo playground VM (throwaway, for hands-on evaluation).
# Requires a signed-in az CLI session with Owner rights on the subscription.

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$adminIp
)

$ErrorActionPreference = 'Stop'

$rg = 'erv1-wingetrepo-play-rg'
$location = 'southafricanorth'
# NOTE: Windows computer name limit is 15 chars, hence the short VM name.
$vmName = 'erv1-wgr-play'
$dnsLabel = 'erv1-wingetrepo-play'
$vmSize = 'Standard_B2s'
$image = 'MicrosoftWindowsDesktop:windows-11:win11-24h2-avd:latest'

# Break-glass local admin password. No RDP/SSH port is open on this VM -
# reachable only through Azure run-command - so this is console-only access.
$chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'.ToCharArray()
$segments = 1..6 | ForEach-Object { -join ($chars | Get-Random -Count 5) }
$adminPassword = ($segments -join '-') + '9Aa!'
$pwFile = "$env:USERPROFILE\hermes_scratch\erv1-wingetrepo-play-admin-creds.txt"
New-Item -ItemType Directory -Force -Path (Split-Path $pwFile) | Out-Null
$adminPassword | Out-File -FilePath $pwFile -Encoding ascii
Write-Host "Break-glass credentials written to $pwFile"

function Invoke-AzStep {
    param([string]$description, [string[]]$argumentList)
    Write-Host ">> $description" -ForegroundColor Cyan
    & az @argumentList
    if ($LASTEXITCODE -ne 0) { throw "FAILED: $description (exit $LASTEXITCODE)" }
}

Invoke-AzStep 'Create resource group' @(
    'group','create','-n',$rg,'-l',$location,
    '--tags','Purpose=playground','Temporary=true','-o','none')

Invoke-AzStep 'Create VNet + subnet' @(
    'network','vnet','create','-g',$rg,'-n','wingetplay-vnet',
    '--address-prefixes','10.30.0.0/24',
    '--subnet-name','wingetplay-subnet','--subnet-prefixes','10.30.0.0/28','-o','none')

Invoke-AzStep 'Create NSG' @('network','nsg','create','-g',$rg,'-n','wingetplay-nsg','-o','none')

Invoke-AzStep 'Allow inbound 5000 from admin IP only (no RDP rule by design)' @(
    'network','nsg','rule','create','-g',$rg,'--nsg-name','wingetplay-nsg',
    '-n','Allow-5000-Admin','--priority','100','--direction','Inbound',
    '--access','Allow','--protocol','Tcp',
    '--source-address-prefixes',($adminIp + '/32'),
    '--destination-port-ranges','5000','-o','none')

Invoke-AzStep 'Create public IP (static, DNS label)' @(
    'network','public-ip','create','-g',$rg,'-n','wingetplay-pip',
    '--sku','Standard','--allocation-method','Static','--dns-name',$dnsLabel,'-o','none')

Invoke-AzStep 'Create NIC' @(
    'network','nic','create','-g',$rg,'-n','wingetplay-nic',
    '--vnet-name','wingetplay-vnet','--subnet','wingetplay-subnet',
    '--public-ip-address','wingetplay-pip','--network-security-group','wingetplay-nsg','-o','none')

Write-Host '>> Creating VM: B2s, Win11 24H2 AVD image, Trusted Launch (few minutes)' -ForegroundColor Cyan
$vmJson = & az vm create -g $rg -n $vmName `
    --image $image `
    --size $vmSize `
    --nics wingetplay-nic `
    --admin-username azureadmin `
    --admin-password $adminPassword `
    --security-type TrustedLaunch `
    --enable-secure-boot true `
    --enable-vtpm true `
    -o json
if ($LASTEXITCODE -ne 0) { throw "FAILED: VM create (exit $LASTEXITCODE)" }
$vm = $vmJson | ConvertFrom-Json

Write-Host ''
Write-Host 'PLAYGROUND VM DEPLOYED' -ForegroundColor Green
Write-Host ("Dashboard: https://" + $dnsLabel + "." + $location + ".cloudapp.azure.com:5000  (first visit = create the admin account)")
Write-Host "Break-glass creds: $pwFile"