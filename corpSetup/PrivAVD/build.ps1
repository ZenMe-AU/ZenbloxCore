# This script needs Packer to be installed.
# winget install -e --id Hashicorp.Packer

# Load KEY=VALUE pairs from .env in this folder into script variables.
Get-Content (Join-Path $PSScriptRoot ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

# Gallery image versions must be unique, so the patch component is the current Unix time (fits Azure's uint32 version limit until year 2106).
$imageVersion = "$IMAGE_VERSION.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

# Pass the same values Terraform used to create the gallery/RG so Packer publishes into the infra that actually exists, instead of its own defaults.
$packerVars = @(
    "-var", "subscription_id=$TF_VAR_subscription_id",
    "-var", "location=$TF_VAR_location",
    "-var", "IMAGE_RG=$TF_VAR_IMAGE_RG",
    "-var", "build_vm_size=$BUILD_VM_SIZE",
    "-var", "gallery_rg=$GALLERY_RG",
    "-var", "gallery_name=$TF_VAR_gallery_name",
    "-var", "image_name=$TF_VAR_image_name",
    "-var", "image_version=$imageVersion"
)

packer init paw-image.pkr.hcl
packer validate @packerVars paw-image.pkr.hcl
packer inspect paw-image.pkr.hcl
packer build @packerVars paw-image.pkr.hcl
