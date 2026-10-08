<#
.SYNOPSIS
Import existing resources when state is missing, then plan and apply PAW resources.

.PARAMETER PlanOnly
deployPAW.ps1 -PlanOnly
Show the Terraform plan without applying it.

.PARAMETER Import
deployPAW.ps1 -Import
Force an import scan even when Terraform state exists.
#>
param(
    [switch]$PlanOnly,
    [switch]$Import
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

function Get-RequiredEnvironmentVariable {
    param(
        [Parameter(Mandatory)] [string]$Name
    )

    $value = [Environment]::GetEnvironmentVariable($Name, "Process")
    if ([string]::IsNullOrWhiteSpace($value)) {
        throw "Required PAW setting '$Name' is missing from $envFile."
    }

    return $value
}

function ConvertTo-NormalizedAzureRegion {
    param(
        [Parameter(Mandatory)] [string]$Name
    )

    return ($Name -replace '[^a-zA-Z0-9]', '').ToLowerInvariant()
}

Import-DotEnv -Path $envFile

$subscriptionId = Get-RequiredEnvironmentVariable -Name "TF_VAR_SUBSCRIPTION_ID"
$targetLocation = Get-RequiredEnvironmentVariable -Name "TF_VAR_PAW_LOCATION"
$hostPoolName = Get-RequiredEnvironmentVariable -Name "TF_VAR_HOST_POOL_NAME"
$targetResourceGroup = "$hostPoolName-rg"
$galleryResourceGroup = Get-RequiredEnvironmentVariable -Name "TF_VAR_GALLERY_RG"
$galleryName = $galleryResourceGroup
$imageName = Get-RequiredEnvironmentVariable -Name "TF_VAR_IMAGE_NAME"

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

[Environment]::SetEnvironmentVariable("TF_VAR_IMAGE_VERSION", $latestImageVersion.name, "Process")
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

    $stateOutput = @(terraform state list 2>&1)
    $stateExitCode = $LASTEXITCODE
    $stateIsMissing = ($stateOutput -join "`n") -match "No state file was found!"
    if ($stateExitCode -ne 0 -and -not $stateIsMissing) {
        throw "Unable to inspect Terraform state for workspace '$targetResourceGroup'."
    }

    $hasStateResources = $stateExitCode -eq 0 -and @(
        $stateOutput | Where-Object { -not [string]::IsNullOrWhiteSpace("$_") }
    ).Count -gt 0
    if ($Import -or -not $hasStateResources) {
        if (-not $Import) {
            Write-Host "Terraform state is missing or empty; importing existing PAW resources."
        }
        & (Join-Path $scriptDirectory "importPAW.ps1")
    }

    # --- Self-heal: subscription-scoped autoscale role assignment ---
    # The autoscale role lives at subscription scope, so it SURVIVES resource
    # group deletion. A fresh workspace (new HOST_POOL_NAME, or a
    # delete-and-restart) then tries to create it again and Azure rejects the
    # apply with 409 RoleAssignmentExists. Import the orphan before planning
    # so the apply is a no-op instead of a collision. ARM-only lookup - this
    # works even when the Graph token is dead (it usually is; the Graph token
    # dies long before the ARM token does).
    $currentState = @(terraform state list 2>$null)
    if (-not ($currentState | Where-Object { $_ -match '^azurerm_role_assignment\.avd_power_management$' })) {
        $roleDefId = az rest --method get --url "https://management.azure.com/subscriptions/$subscriptionId/providers/Microsoft.Authorization/roleDefinitions?api-version=2022-04-01&`$filter=roleName eq 'Desktop Virtualization Power On Off Contributor'" --query 'value[0].id' -o tsv 2>$null
        if ($LASTEXITCODE -eq 0 -and -not [string]::IsNullOrWhiteSpace("$roleDefId")) {
            $assignmentsJson = az rest --method get --url "https://management.azure.com/subscriptions/$subscriptionId/providers/Microsoft.Authorization/roleAssignments?api-version=2022-04-01&`$filter=atScope()" -o json 2>$null
            if ($LASTEXITCODE -eq 0 -and "$assignmentsJson".Trim()) {
                $assignmentsDoc = "$assignmentsJson" | ConvertFrom-Json
            $existing = @($assignmentsDoc.value) | Where-Object { "$($_.properties.roleDefinitionId)" -eq "$roleDefId".Trim() -and "$($_.properties.scope)" -eq "/subscriptions/$subscriptionId" }
                if ($existing.Count -ge 1) {
                    $orphanId = $existing[0].id
                    Write-Host "Importing existing subscription-scope autoscale role assignment: $orphanId"
                    terraform import -input=false azurerm_role_assignment.avd_power_management $orphanId
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "WARNING: import of the autoscale role assignment failed; apply may fail with 409 RoleAssignmentExists."
                    }
                }
            }
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
