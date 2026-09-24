# This script needs Packer to be installed.
# winget install -e --id Hashicorp.Packer

# Load KEY=VALUE pairs from the shared PrivAVD .env into script variables.
Get-Content (Join-Path $PSScriptRoot "..\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

$targetLocation = if (-not [string]::IsNullOrWhiteSpace($AVD_LOCATION)) { $AVD_LOCATION } else { $TF_VAR_location }
if ([string]::IsNullOrWhiteSpace($targetLocation)) {
    throw "AVD_LOCATION is required in .env."
}
$packerTemplate = Join-Path $PSScriptRoot "paw-image.pkr.hcl"

# Gallery image versions must be unique, so the patch component is the current Unix time (fits Azure's uint32 version limit until year 2106).
$imageVersion = "$IMAGE_VERSION.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

# Pass the same values Terraform used to create the gallery/RG so Packer
# publishes into the infra that actually exists, instead of its own defaults.
$packerVars = @(
    "-var", "subscription_id=$TF_VAR_subscription_id",
    "-var", "location=$targetLocation",
    "-var", "build_vm_size=$BUILD_VM_SIZE",
    "-var", "gallery_rg=$TF_VAR_IMAGE_RG",
    "-var", "gallery_name=$TF_VAR_gallery_name",
    "-var", "image_name=$TF_VAR_image_name",
    "-var", "image_version=$imageVersion"
)

packer init $packerTemplate
packer validate @packerVars $packerTemplate
packer inspect $packerTemplate
packer build @packerVars $packerTemplate