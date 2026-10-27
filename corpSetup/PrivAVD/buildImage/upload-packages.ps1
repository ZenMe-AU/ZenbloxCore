# Uploads the offline package archive to Azure Blob Storage and writes the
# read-only SAS URL into the shared .env (TF_VAR_PACKAGE_URL) so build.ps1
# can pass it to Packer as the PACKAGE_URL variable.
#
# Run AFTER make-packages-zip.ps1 whenever the package set changes:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File upload-packages.ps1
#
# Requires: az CLI logged in
#   az login --tenant "15fb0613-7977-4551-801b-6aadac824241"
# and an active PIM role with Contributor/Owner on the gallery resource
# group (same activation needed for builds).
#
# Why: bulk WinRM uploads (Packer file provisioner) hung the build twice -
# a 68-file directory walk AND a single 53 MB zip. The build VM now
# downloads the archive from Azure Storage over the intra-Azure path
# (seconds, with progress output in the install provisioner) instead.

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"

# Load KEY=VALUE pairs from the shared PrivAVD .env (same parser as build.ps1).
Get-Content (Join-Path $PSScriptRoot "..\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

$accountName    = "zenwingetpackages"   # globally unique, lowercase, no hyphens
$container      = "wingetrepo"
$blobName       = "wingetrepo-packages.zip"
$zipPath        = "C:\zenme\dependencies\wingetrepo-packages.zip"
$resourceGroup  = $TF_VAR_GALLERY_RG
$location       = $TF_VAR_PAW_LOCATION

if ([string]::IsNullOrWhiteSpace($resourceGroup) -or [string]::IsNullOrWhiteSpace($location)) {
    throw "TF_VAR_GALLERY_RG / TF_VAR_PAW_LOCATION missing in .env"
}
if (-not (Test-Path $zipPath)) {
    throw "Archive not found: $zipPath. Run make-packages-zip.ps1 first."
}

Write-Host ">> Ensuring storage account $accountName in $resourceGroup ($location)"
az storage account create --name $accountName --resource-group $resourceGroup --location $location --sku Standard_LRS --kind StorageV2 --only-show-errors
if ($LASTEXITCODE -ne 0) { throw "az storage account create failed. Is az logged in with an active PIM role? (az login --tenant 15fb0613-7977-4551-801b-6aadac824241)" }

Write-Host ">> Ensuring container $container"
az storage container show --account-name $accountName --name $container --auth-mode login --only-show-errors *> $null
if ($LASTEXITCODE -ne 0) {
    az storage container create --account-name $accountName --name $container --auth-mode login --only-show-errors
    if ($LASTEXITCODE -ne 0) { throw "az storage container create failed" }
}

Write-Host ">> Uploading $zipPath"
$zipMb = [math]::Round((Get-Item $zipPath).Length / 1MB, 1)
$uploadStart = Get-Date
az storage blob upload --account-name $accountName --auth-mode login --container-name $container --name $blobName --file $zipPath --overwrite --only-show-errors
if ($LASTEXITCODE -ne 0) { throw "az storage blob upload failed" }
Write-Host ("   Uploaded {0} MB in {1}s" -f $zipMb, [int]((Get-Date) - $uploadStart).TotalSeconds)

Write-Host ">> Minting read-only SAS URL (valid 1 year, HTTPS only)"
$key = az storage account keys list --account-name $accountName --resource-group $resourceGroup --query "[0].value" --output tsv
if ($LASTEXITCODE -ne 0) { throw "az storage account keys list failed" }
$expiry = (Get-Date).ToUniversalTime().AddYears(1).ToString("yyyy-MM-dd")
$sas = az storage blob generate-sas --account-name $accountName --account-key $key --container-name $container --name $blobName --permissions r --expiry $expiry --https-only --output tsv
if ($LASTEXITCODE -ne 0) { throw "az storage blob generate-sas failed" }
$url = "https://$accountName.blob.core.windows.net/$container/$blobName?$sas"

Write-Host ">> Writing TF_VAR_PACKAGE_URL into the shared .env"
$envPath = Join-Path $PSScriptRoot "..\.env"
$lines = @(Get-Content $envPath)
$updated = $false
for ($i = 0; $i -lt $lines.Count; $i++) {
    if ($lines[$i] -match '^\s*TF_VAR_PACKAGE_URL=') {
        $lines[$i] = "TF_VAR_PACKAGE_URL=$url"
        $updated = $true
        break
    }
}
if (-not $updated) { $lines += "TF_VAR_PACKAGE_URL=$url" }
Set-Content -Path $envPath -Value $lines

Write-Host "UPLOAD COMPLETE" -ForegroundColor Green
Write-Host "  Blob   : https://$accountName.blob.core.windows.net/$container/$blobName"
Write-Host "  SAS URL written to .env (TF_VAR_PACKAGE_URL), expires $expiry"
Write-Host "  Next   : .\build.ps1"