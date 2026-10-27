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

# Self-heal the offline package blob: ensure-packages.ps1 probes the SAS URL
# and rebuilds everything from corpSetup/WingetRepo/dependencies (zip ->
# storage account -> blob -> fresh SAS -> .env) if the blob is missing,
# unreachable, or the storage account was deleted. No manual upload step.
& (Join-Path $PSScriptRoot 'ensure-packages.ps1')

# ensure-packages.ps1 may have (re)written .env - re-read the URL it wrote.
$TF_VAR_PACKAGE_URL = $null
Get-Content (Join-Path $PSScriptRoot "..\.env") | ForEach-Object {
    if ($_ -match '^\s*TF_VAR_PACKAGE_URL\s*=\s*(.+)$') { $TF_VAR_PACKAGE_URL = $Matches[1].Trim() }
}
if ([string]::IsNullOrWhiteSpace($TF_VAR_PACKAGE_URL)) {
    throw "TF_VAR_PACKAGE_URL is still missing after ensure-packages.ps1 ran - see its output above."
}

# Pass the same values Terraform used to create the gallery/RG so Packer
# publishes into the infra that actually exists, instead of its own defaults.

$packerVars = @(
    "-var", "SUBSCRIPTION_ID=$TF_VAR_SUBSCRIPTION_ID",
    "-var", "PAW_LOCATION=$targetLocation",
    "-var", "BUILD_VM_SIZE=$TF_VAR_BUILD_VM_SIZE",
    "-var", "GALLERY_RG=$TF_VAR_GALLERY_RG",
    "-var", "IMAGE_NAME=$TF_VAR_IMAGE_NAME",
    "-var", "IMAGE_VERSION=$imageVersion",
    "-var", "PACKAGE_URL=$TF_VAR_PACKAGE_URL"
)

Push-Location $PSScriptRoot
try {
    packer init $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer init failed with exit code $LASTEXITCODE." }

    packer validate @packerVars $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer validate failed with exit code $LASTEXITCODE. Check the .env values." }

    packer inspect $packerTemplate
    packer build @packerVars $packerTemplate
    if ($LASTEXITCODE -ne 0) { throw "packer build FAILED with exit code $LASTEXITCODE. The image was NOT published to the gallery. Check the Packer output above: if the error is a dial/connect timeout (connectex / connection attempt failed), it is a transient network blip between this PC and the Azure build VM - just rerun the build. If the errors are auth-related (token does not exist / claims challenge), run az login again first, then rerun." }
}
finally {
    Pop-Location
}