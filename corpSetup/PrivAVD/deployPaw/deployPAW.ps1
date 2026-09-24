param(
    [switch]$PlanOnly
)

$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$terraformDirectory = $scriptDirectory
$envFile = Join-Path $scriptDirectory "..\.env"

if (-not (Test-Path -LiteralPath $envFile)) {
    throw "Environment file was not found: $envFile"
}

if (-not (Get-Command terraform -ErrorAction SilentlyContinue)) {
    throw "terraform was not found on PATH. Install Terraform before running this script."
}

if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    throw "Azure CLI (az) was not found on PATH. Install it and sign in before running this script."
}


function Import-DotEnv {
    param(
        [string]$Path = (Join-Path $PSScriptRoot "..\.env")
    )
    Get-Content -LiteralPath $Path | ForEach-Object {
        $line = $_.Trim()
        if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
            return
        }
        $idx = $line.IndexOf('=')
        if ($idx -lt 1) {
            return
        }
        $name = $line.Substring(0, $idx).Trim()
        $value = $line.Substring($idx + 1).Trim('"', "'")
        [Environment]::SetEnvironmentVariable($name, $value, 'Process')
    }
}

function Set-TerraformVariable {
    param(
        [Parameter(Mandatory)] [string]$TerraformName,
        [Parameter(Mandatory)] [string[]]$SourceNames,
        [switch]$Required
    )

    $terraformEnvironmentName = "TF_VAR_$TerraformName"
    $value = $null

    foreach ($sourceName in $SourceNames) {
        $value = [Environment]::GetEnvironmentVariable($sourceName, "Process")
        if (-not [string]::IsNullOrWhiteSpace($value)) {
            break
        }
    }

    if ($Required -and [string]::IsNullOrWhiteSpace($value)) {
        throw "Required AVD setting is missing. Add one of [$($SourceNames -join ', ')] to $envFile."
    }

    if (-not [string]::IsNullOrWhiteSpace($value)) {
        [Environment]::SetEnvironmentVariable($terraformEnvironmentName, $value, "Process")
    }
}

function ConvertTo-NormalizedAzureRegion {
    param(
        [Parameter(Mandatory)] [string]$Name
    )

    return ($Name -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
}

Import-DotEnv -Path $envFile

# Reuse the existing PrivAVD .env names and support TF_VAR_* names directly.
Set-TerraformVariable -TerraformName "subscription_id" -SourceNames @("TF_VAR_subscription_id") -Required
Set-TerraformVariable -TerraformName "location" -SourceNames @("AVD_LOCATION", "TF_VAR_location") -Required
Set-TerraformVariable -TerraformName "resource_group_name" -SourceNames @("AVD_RESOURCE_GROUP", "TF_VAR_resource_group_name") -Required
Set-TerraformVariable -TerraformName "gallery_resource_group_name" -SourceNames @("GALLERY_RG", "TF_VAR_IMAGE_RG")
Set-TerraformVariable -TerraformName "gallery_name" -SourceNames @("TF_VAR_gallery_name")
Set-TerraformVariable -TerraformName "image_name" -SourceNames @("TF_VAR_image_name")

$subscriptionId = [Environment]::GetEnvironmentVariable("TF_VAR_subscription_id", "Process")
$targetLocation = [Environment]::GetEnvironmentVariable("TF_VAR_location", "Process")
$targetResourceGroup = [Environment]::GetEnvironmentVariable("TF_VAR_resource_group_name", "Process")
$galleryResourceGroup = [Environment]::GetEnvironmentVariable("TF_VAR_gallery_resource_group_name", "Process")
$galleryName = [Environment]::GetEnvironmentVariable("TF_VAR_gallery_name", "Process")
$imageName = [Environment]::GetEnvironmentVariable("TF_VAR_image_name", "Process")

$imageVersionsJson = az sig image-version list `
    --subscription $subscriptionId `
    --resource-group $galleryResourceGroup `
    --gallery-name $galleryName `
    --gallery-image-definition $imageName `
    --output json

if ($LASTEXITCODE -ne 0) {
    throw "Unable to list Azure Compute Gallery image versions. Confirm Azure CLI login and gallery access."
}

$imageVersions = @($imageVersionsJson | ConvertFrom-Json)
$normalizedTargetLocation = ConvertTo-NormalizedAzureRegion -Name $targetLocation
$latestImageVersion = $imageVersions |
Where-Object {
    $targetRegions = @($_.publishingProfile.targetRegions)
    $_.name -and
    $_.publishingProfile.publishedDate -and
    ($targetRegions | Where-Object {
        $_.name -and
        (ConvertTo-NormalizedAzureRegion -Name $_.name) -eq $normalizedTargetLocation
    })
} |
Sort-Object { [DateTime]$_.publishingProfile.publishedDate } -Descending |
Select-Object -First 1

if ($null -eq $latestImageVersion) {
    throw "No published image versions for $galleryName/$imageName are replicated to Azure region '$targetLocation'."
}

[Environment]::SetEnvironmentVariable("TF_VAR_image_version", $latestImageVersion.name, "Process")
Write-Host "Using latest Azure Compute Gallery image version in ${targetLocation}: $($latestImageVersion.name)"
Write-Host "Deploying all AVD resources to resource group '$targetResourceGroup' in '$targetLocation'"

Push-Location $terraformDirectory
try {
    terraform init -input=false
    if ($LASTEXITCODE -ne 0) {
        throw "terraform init failed with exit code $LASTEXITCODE."
    }

    terraform workspace select $targetResourceGroup
    if ($LASTEXITCODE -ne 0) {
        terraform workspace new $targetResourceGroup
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to select or create Terraform workspace '$targetResourceGroup'."
        }
    }

    terraform validate
    if ($LASTEXITCODE -ne 0) {
        throw "terraform validate failed with exit code $LASTEXITCODE."
    }

    $planFile = Join-Path $terraformDirectory "avd.tfplan"
    terraform plan -input=false "-out=$planFile"
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
