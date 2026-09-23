param(
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$terraformDirectory = Join-Path $scriptDirectory "avd"
$envFile = Join-Path $scriptDirectory ".env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Environment file was not found: $envFile"
}

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    throw "terraform was not found on PATH. Install Terraform before running this script."
}


function Import-DotEnv {
    param([string]$Path)

    foreach ($line in Get-Content -LiteralPath $Path) {
        $trimmedLine = $line.Trim()
        if ([string]::IsNullOrWhiteSpace($trimmedLine) -or $trimmedLine.StartsWith("#")) {
            continue
        }

        $separatorIndex = $trimmedLine.IndexOf("=")
        if ($separatorIndex -lt 1) {
            continue
        }

        $name = $trimmedLine.Substring(0, $separatorIndex).Trim()
        $value = $trimmedLine.Substring($separatorIndex + 1).Trim()
        if (($value.StartsWith('"') -and $value.EndsWith('"')) -or
            ($value.StartsWith("'") -and $value.EndsWith("'"))) {
            $value = $value.Substring(1, $value.Length - 2)
        }

        [Environment]::SetEnvironmentVariable($name, $value, "Process")
    }
}

function Set-TerraformVariable {
    param(
        [Parameter(Mandatory)] [string]$TerraformName,
        [Parameter(Mandatory)] [string[]]$SourceNames,
        [switch]$Required
    )

    $terraformEnvironmentName = "TF_VAR_$TerraformName"
    $value = [Environment]::GetEnvironmentVariable($terraformEnvironmentName, "Process")

    if ([string]::IsNullOrWhiteSpace($value)) {
        foreach ($sourceName in $SourceNames) {
            $value = [Environment]::GetEnvironmentVariable($sourceName, "Process")
            if (-not [string]::IsNullOrWhiteSpace($value)) {
                break
            }
        }
    }

    if ($Required -and [string]::IsNullOrWhiteSpace($value)) {
        throw "Required AVD setting is missing. Add one of [$($SourceNames -join ', ')] to $envFile."
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
        [Environment]::SetEnvironmentVariable($terraformEnvironmentName, $value, "Process")
    }
}

Import-DotEnv -Path $envFile

# Reuse the existing PrivAVD .env names and support TF_VAR_* names directly.
Set-TerraformVariable -TerraformName "subscription_id" -SourceNames @("TF_VAR_subscription_id") -Required
Set-TerraformVariable -TerraformName "location" -SourceNames @("TF_VAR_location")
Set-TerraformVariable -TerraformName "gallery_resource_group_name" -SourceNames @("GALLERY_RG", "TF_VAR_IMAGE_RG")
Set-TerraformVariable -TerraformName "gallery_name" -SourceNames @("TF_VAR_gallery_name")
Set-TerraformVariable -TerraformName "image_name" -SourceNames @("TF_VAR_image_name")
Set-TerraformVariable -TerraformName "image_version" -SourceNames @("AVD_IMAGE_VERSION", "TF_VAR_image_version") -Required
Set-TerraformVariable -TerraformName "subnet_id" -SourceNames @("AVD_SUBNET_ID", "TF_VAR_subnet_id") -Required
Set-TerraformVariable -TerraformName "administrator_password" -SourceNames @("AVD_ADMINISTRATOR_PASSWORD", "TF_VAR_administrator_password") -Required
Set-TerraformVariable -TerraformName "domain_name" -SourceNames @("AVD_DOMAIN_NAME", "TF_VAR_domain_name") -Required
Set-TerraformVariable -TerraformName "domain_join_username" -SourceNames @("AVD_DOMAIN_JOIN_USERNAME", "TF_VAR_domain_join_username") -Required
Set-TerraformVariable -TerraformName "domain_join_password" -SourceNames @("AVD_DOMAIN_JOIN_PASSWORD", "TF_VAR_domain_join_password") -Required

Push-Location $terraformDirectory
try {
    terraform init -input=false
    if ($LASTEXITCODE -ne 0) {
        throw "terraform init failed with exit code $LASTEXITCODE."
    }

    terraform validate
    if ($LASTEXITCODE -ne 0) {
        throw "terraform validate failed with exit code $LASTEXITCODE."
    }

    $planFile = Join-Path $terraformDirectory "avd.tfplan"
    terraform plan -input=false -out=$planFile
    if ($LASTEXITCODE -ne 0) {
        throw "terraform plan failed with exit code $LASTEXITCODE."
    }

    if (-not $PlanOnly) {
        terraform apply -input=false $planFile
        if ($LASTEXITCODE -ne 0) {
            throw "terraform apply failed with exit code $LASTEXITCODE."
        }
    }
}
finally {
    Pop-Location
}
