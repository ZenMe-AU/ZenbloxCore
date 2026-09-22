# TODO: Add packer installer to the deployLocalDependencies script from ZBReact.
#winget install -e --id Hashicorp.Packer

# End-to-end Speedify image pipeline:
#   1. Read all config from corp.env (single source of truth for the corp)
#   2. Verify the subscription matches the active `az login` session
#   3. Ensure the Azure Compute Gallery + image definition exist (first-run safe)
#   4. Delete the existing gallery version + old managed image (overwrite, not fail)
#   5. Run the Packer HCL build, which publishes the fresh image into the gallery
#
# Usage:
#   .\build.ps1                     # rebuild version from corp.env (SPEEDIFY_IMAGE_VERSION)
#   .\build.ps1 -ImageVersion 1.0.1 # rebuild a specific version (overrides corp.env)
#   .\build.ps1 -SkipVersionDelete  # keep the existing version (fails if it exists)

[CmdletBinding()]
param(
    [string]$ImageVersion = "",
    [switch]$SkipVersionDelete
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 1. Read the config from corp.env (single source of truth - no duplicated
#    values here or in the Packer template)
# ---------------------------------------------------------------------------
$CorpEnvPath = Join-Path $PSScriptRoot '..' 'corp.env'
if (-not (Test-Path $CorpEnvPath)) {
    throw "corp.env not found: $CorpEnvPath"
}

$Corp = @{}
foreach ($line in (Get-Content $CorpEnvPath)) {
    $trimmed = $line.Trim()
    if ($trimmed -eq '' -or $trimmed.StartsWith('#')) { continue }
    $idx = $trimmed.IndexOf('=')
    if ($idx -lt 1) { continue }
    $Corp[$trimmed.Substring(0, $idx).Trim()] = $trimmed.Substring($idx + 1).Trim()
}

function Get-CorpValue([string]$Key) {
    if (-not $Corp.ContainsKey($Key) -or [string]::IsNullOrWhiteSpace($Corp[$Key])) {
        throw "Required key '$Key' is missing or empty in $CorpEnvPath"
    }
    return $Corp[$Key]
}

$SubscriptionId = Get-CorpValue 'SUBSCRIPTION_ID'
$Location = Get-CorpValue 'SPEEDIFY_LOCATION'
$GalleryRg = Get-CorpValue 'SPEEDIFY_RESOURCE_GROUP'
$GalleryName = Get-CorpValue 'SPEEDIFY_GALLERY_NAME'
$ImageName = Get-CorpValue 'SPEEDIFY_IMAGE_NAME'
$BuildVmSize = Get-CorpValue 'SPEEDIFY_BUILD_VM_SIZE'
if (-not $ImageVersion) { $ImageVersion = Get-CorpValue 'SPEEDIFY_IMAGE_VERSION' }

Write-Host "Config (from corp.env):" -ForegroundColor Cyan
Write-Host "  subscription   : $SubscriptionId"
Write-Host "  resource group : $GalleryRg"
Write-Host "  gallery        : $GalleryName"
Write-Host "  image          : $ImageName"
Write-Host "  version        : $ImageVersion"
Write-Host "  location       : $Location"
Write-Host "  build VM size  : $BuildVmSize"

# ---------------------------------------------------------------------------
# 2. Verify the subscription matches the active `az login` session
# ---------------------------------------------------------------------------
Write-Host "`nVerifying active az login session..." -ForegroundColor Cyan
$CurrentAccount = az account show --query "{id:id, name:name}" -o json 2>$null
if ($LASTEXITCODE -ne 0) {
    throw "Not logged in to Azure CLI. Run 'az login' first."
}
$CurrentAccount = $CurrentAccount | ConvertFrom-Json
if ($CurrentAccount.id -ne $SubscriptionId) {
    throw "Active az login subscription ($($CurrentAccount.id) - '$($CurrentAccount.name)') does not match corp.env SUBSCRIPTION_ID ($SubscriptionId). Run: az account set --subscription $SubscriptionId"
}
Write-Host "  active subscription matches corp.env ($($CurrentAccount.name))."

# ---------------------------------------------------------------------------
# 3. Ensure the gallery and image definition exist (idempotent, first-run safe)
# ---------------------------------------------------------------------------
Write-Host "`nEnsuring gallery '$GalleryName' exists in '$GalleryRg'..." -ForegroundColor Cyan
if (-not (az sig show --resource-group $GalleryRg --gallery-name $GalleryName 2>$null)) {
    Write-Host "  not found - creating gallery '$GalleryName'..."
    az sig create --resource-group $GalleryRg --gallery-name $GalleryName --location $Location | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create gallery '$GalleryName'" }
}
else {
    Write-Host "  gallery exists."
}

Write-Host "`nEnsuring image definition '$ImageName' exists..." -ForegroundColor Cyan
if (-not (az sig image-definition show --resource-group $GalleryRg --gallery-name $GalleryName --gallery-image-definition $ImageName 2>$null)) {
    Write-Host "  not found - creating image definition '$ImageName'..."
    az sig image-definition create `
        --resource-group $GalleryRg `
        --gallery-name $GalleryName `
        --gallery-image-definition $ImageName `
        --publisher Zenblox `
        --offer Speedify `
        --sku server `
        --os-type Linux `
        --os-state Generalized | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "Failed to create image definition '$ImageName'" }
}
else {
    Write-Host "  image definition exists."
}

# ---------------------------------------------------------------------------
# 4. Delete the existing version + stale managed image (overwrite semantics)
# ---------------------------------------------------------------------------
if (-not $SkipVersionDelete) {
    Write-Host "`nDeleting existing gallery version $ImageVersion (if present)..." -ForegroundColor Cyan
    az sig image-version delete `
        --resource-group $GalleryRg `
        --gallery-name $GalleryName `
        --gallery-image-definition $ImageName `
        --gallery-image-version $ImageVersion 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  deleted." } else { Write-Host "  not present - nothing to delete." }

    Write-Host "Deleting stale managed image '$ImageName' (if present)..."
    az image delete --resource-group $GalleryRg --name $ImageName 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  deleted." } else { Write-Host "  not present - nothing to delete." }
}
else {
    Write-Host "`n-SkipVersionDelete set - keeping existing version $ImageVersion." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 5. Run the Packer HCL build (publishes the fresh image into the gallery)
# ---------------------------------------------------------------------------
Write-Host "`nRunning Packer HCL build..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
    packer init .
    if ($LASTEXITCODE -ne 0) { throw "packer init failed" }

    packer validate `
        -var "subscription_id=$SubscriptionId" `
        -var "location=$Location" `
        -var "resource_group=$GalleryRg" `
        -var "gallery_name=$GalleryName" `
        -var "image_name=$ImageName" `
        -var "image_version=$ImageVersion" `
        -var "build_vm_size=$BuildVmSize" `
        speedify-image.pkr.hcl
    if ($LASTEXITCODE -ne 0) { throw "packer validate failed" }

    packer build `
        -var "subscription_id=$SubscriptionId" `
        -var "location=$Location" `
        -var "resource_group=$GalleryRg" `
        -var "gallery_name=$GalleryName" `
        -var "image_name=$ImageName" `
        -var "image_version=$ImageVersion" `
        -var "build_vm_size=$BuildVmSize" `
        speedify-image.pkr.hcl
    if ($LASTEXITCODE -ne 0) { throw "packer build failed" }
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 6. Report the result (id, provisioning state, target regions)
# ---------------------------------------------------------------------------
Write-Host "`nPipeline complete." -ForegroundColor Green
Write-Host "Gallery image version:"
az sig image-version show `
    --resource-group $GalleryRg `
    --gallery-name $GalleryName `
    --gallery-image-definition $ImageName `
    --gallery-image-version $ImageVersion `
    --query "{id:id, name:name, provisioningState:provisioningState, targetRegions:publishingProfile.targetRegions[].name}" `
    -o json

Write-Host "`nTerraform picks this up automatically via the azurerm_shared_image data source in speedify.tf (gallery '$GalleryName', image '$ImageName')." -ForegroundColor Cyan