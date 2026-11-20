#   terraform init @(& ..\tfBackend.ps1 -Key privavd-paw.tfstate)
param(
    [Parameter(Mandatory)] [string]$Key
)

$ErrorActionPreference = 'Stop'

$settings = @{}
Get-Content (Join-Path $PSScriptRoot '.env') | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') { $settings[$Matches[1].Trim()] = $Matches[2].Trim() }
}
foreach ($name in 'TF_VAR_SUBSCRIPTION_ID', 'TF_STATE_RESOURCE_GROUP', 'TF_STATE_STORAGE_ACCOUNT', 'TF_STATE_CONTAINER') {
    if ([string]::IsNullOrWhiteSpace($settings[$name])) { throw "Required setting '$name' is missing from .env." }
}

"-backend-config=subscription_id=$($settings['TF_VAR_SUBSCRIPTION_ID'])"
"-backend-config=resource_group_name=$($settings['TF_STATE_RESOURCE_GROUP'])"
"-backend-config=storage_account_name=$($settings['TF_STATE_STORAGE_ACCOUNT'])"
"-backend-config=container_name=$($settings['TF_STATE_CONTAINER'])"
"-backend-config=key=$Key"
