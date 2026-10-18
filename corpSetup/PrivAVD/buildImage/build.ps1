# This script needs Packer to be installed.
# winget install -e --id Hashicorp.Packer

# Load KEY=VALUE pairs from the shared PrivAVD .env into script variables.
Get-Content (Join-Path $PSScriptRoot "..\.env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

$targetLocation = $TF_VAR_PAW_LOCATION
if ([string]::IsNullOrWhiteSpace($targetLocation)) {
    throw "TF_VAR_PAW_LOCATION is required in .env."
}
$packerTemplate = Join-Path $PSScriptRoot "paw-image.pkr.hcl"

# Gallery image versions must be unique, so the patch component is the current Unix time (fits Azure's uint32 version limit until year 2106).
$imageVersion = "$TF_VAR_IMAGE_VERSION.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

# Pass the same values Terraform used to create the gallery/RG so Packer
# publishes into the infra that actually exists, instead of its own defaults.
$packerVars = @(
    "-var", "SUBSCRIPTION_ID=$TF_VAR_SUBSCRIPTION_ID",
    "-var", "PAW_LOCATION=$targetLocation",
    "-var", "BUILD_VM_SIZE=$TF_VAR_BUILD_VM_SIZE",
    "-var", "GALLERY_RG=$TF_VAR_GALLERY_RG",
    "-var", "IMAGE_NAME=$TF_VAR_IMAGE_NAME",
    "-var", "IMAGE_VERSION=$imageVersion"
)

Push-Location $PSScriptRoot
try {
    packer init $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer init failed with exit code $LASTEXITCODE." }

    packer validate @packerVars $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer validate failed with exit code $LASTEXITCODE. Check the .env values." }

    packer inspect $packerTemplate
    packer build @packerVars $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer build FAILED with exit code $LASTEXITCODE. The image was NOT published to the gallery. Check the Packer output above; a common cause on this tenant is an expired az login (run the az login command with --claims-challenge that the error prints, then rerun)." }
}
finally {
    Pop-Location
}