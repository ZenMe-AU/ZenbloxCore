# TODO: Add packer installer to the deployLocalDependencies script from ZBReact.
#winget install -e --id Hashicorp.Packer

# End-to-end Speedify image pipeline:
#   1. Parse the gallery naming from speedify-image.pkr.hcl (single source of truth)
#   2. Ensure the Azure Compute Gallery + image definition exist (first-run safe)
#   3. Delete the existing gallery version + old managed image (overwrite, not fail)
#   4. Run the Packer HCL build, which publishes the fresh image into the gallery
#
# Usage:
#   .\build.ps1                     # rebuild version 1.0.0 (default from pkr.hcl)
#   .\build.ps1 -ImageVersion 1.0.1 # rebuild a specific version
#   .\build.ps1 -SkipVersionDelete  # keep the existing version (fails if it exists)

[CmdletBinding()]
param(
    [string]$ImageVersion = "",
    [switch]$SkipVersionDelete
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------------
# 1. Pull the gallery naming from the HCL template (no duplicated config here)
# ---------------------------------------------------------------------------
$Template = Join-Path $PSScriptRoot 'speedify-image.pkr.hcl'
if (-not (Test-Path $Template)) {
    throw "Packer template not found: $Template"
}

function Get-HclDefault([string]$VarName) {
    # Matches:  variable "name" { ... default = "value" }
    $pattern = 'variable\s+"' + [regex]::Escape($VarName) + '"\s*\{[^}]*?default\s*=\s*"([^"]+)"'
    $m = [regex]::Match((Get-Content $Template -Raw), $pattern, 'Singleline')
    if (-not $m.Success) {
        throw "Variable '$VarName' (with a default) not found in $Template"
    }
    return $m.Groups[1].Value
}

$GalleryRg    = Get-HclDefault 'gallery_rg'
$GalleryName  = Get-HclDefault 'gallery_name'
$ImageName    = Get-HclDefault 'image_name'
$Location     = Get-HclDefault 'location'
if (-not $ImageVersion) { $ImageVersion = Get-HclDefault 'image_version' }

Write-Host "Gallery naming (from speedify-image.pkr.hcl):" -ForegroundColor Cyan
Write-Host "  resource group : $GalleryRg"
Write-Host "  gallery        : $GalleryName"
Write-Host "  image          : $ImageName"
Write-Host "  version        : $ImageVersion"
Write-Host "  location       : $Location"

# ---------------------------------------------------------------------------
# 2. Ensure the gallery and image definition exist (idempotent, first-run safe)
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

Write-Host "`nEnsuring image definition 'speedify' exists..." -ForegroundColor Cyan
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
# 3. Delete the existing version + stale managed image (overwrite semantics)
# ---------------------------------------------------------------------------
if (-not $SkipVersionDelete) {
    Write-Host "`nDeleting existing gallery version $ImageVersion (if present)..." -ForegroundColor Cyan
    az sig image-version delete `
        --resource-group $GalleryRg `
        --gallery-name $GalleryName `
        --gallery-image-definition $ImageName `
        --gallery-image-version $ImageVersion 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  deleted." } else { Write-Host "  not present - nothing to delete." }

    Write-Host "Deleting stale managed image 'speedify' (if present)..."
    az image delete --resource-group $GalleryRg --name speedify 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { Write-Host "  deleted." } else { Write-Host "  not present - nothing to delete." }
}
else {
    Write-Host "`n-SkipVersionDelete set - keeping existing version $ImageVersion." -ForegroundColor Yellow
}

# ---------------------------------------------------------------------------
# 4. Run the Packer HCL build (publishes the fresh image into the gallery)
# ---------------------------------------------------------------------------
Write-Host "`nRunning Packer HCL build..." -ForegroundColor Cyan
Push-Location $PSScriptRoot
try {
    packer init .
    if ($LASTEXITCODE -ne 0) { throw "packer init failed" }

    packer validate -var "image_version=$ImageVersion" speedify-image.pkr.hcl
    if ($LASTEXITCODE -ne 0) { throw "packer validate failed" }

    packer build -var "image_version=$ImageVersion" speedify-image.pkr.hcl
    if ($LASTEXITCODE -ne 0) { throw "packer build failed" }
}
finally {
    Pop-Location
}

# ---------------------------------------------------------------------------
# 5. Report the result (id, provisioning state, target regions)
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
Write-Host "Version ID: $VersionId"