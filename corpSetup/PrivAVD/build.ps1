# TODO: Add packer installer to the deployLocalDependencies script from ZBReact.
#winget install -e --id Hashicorp.Packer

# Load KEY=VALUE pairs from .env in this folder into script variables.
Get-Content (Join-Path $PSScriptRoot ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

# Gallery image versions must be unique, so the patch component is the
# current Unix time (fits Azure's uint32 version limit until year 2106).
$imageVersion = "1.0.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

packer init paw-image.pkr.hcl
packer validate -var "image_version=$imageVersion" paw-image.pkr.hcl
packer inspect paw-image.pkr.hcl
packer build -var "image_version=$imageVersion" paw-image.pkr.hcl
