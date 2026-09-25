$ErrorActionPreference = "Stop"

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
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

Get-Content -LiteralPath $envFile | ForEach-Object {
    $line = $_.Trim()
    if ([string]::IsNullOrWhiteSpace($line) -or $line.StartsWith('#')) {
        return
    }

    $separatorIndex = $line.IndexOf('=')
    if ($separatorIndex -lt 1) {
        return
    }

    $name = $line.Substring(0, $separatorIndex).Trim()
    $value = $line.Substring($separatorIndex + 1).Trim('"', "'")
    [Environment]::SetEnvironmentVariable($name, $value, 'Process')
}

$targetResourceGroup = [Environment]::GetEnvironmentVariable("TF_VAR_PAW_RG", "Process")
if ([string]::IsNullOrWhiteSpace($targetResourceGroup)) {
    throw "Required PAW setting 'TF_VAR_PAW_RG' is missing from $envFile."
}

$pawLoginGroupName = [Environment]::GetEnvironmentVariable("TF_VAR_PAW_GROUP", "Process")
if ([string]::IsNullOrWhiteSpace($pawLoginGroupName)) {
    $pawLoginGroupName = "PawUsers"
}

Push-Location $scriptDirectory
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

    $state = @(terraform state list 2>$null)
    if ($state.Count -gt 0) {
        throw "Import requires empty Terraform state, but workspace '$targetResourceGroup' contains $($state.Count) resource(s)."
    }

    $groups = @(
        @{
            Address     = "azuread_group.paw_login"
            DisplayName = $pawLoginGroupName
        },
        @{
            Address     = "azuread_group.privileged_accounts"
            DisplayName = "PrivilegedAccounts"
        }
    )

    $imports = @(foreach ($group in $groups) {
            $groupId = az ad group list --filter "displayName eq '$($group.DisplayName)'" --query "[0].id" -o tsv
            if ($LASTEXITCODE -ne 0) {
                throw "Unable to look up the Entra ID group '$($group.DisplayName)'. Confirm Azure CLI login and directory read access."
            }

            if (-not [string]::IsNullOrWhiteSpace($groupId)) {
                @{
                    Address = $group.Address
                    Id      = "/groups/$groupId"
                }
            }
        })

    foreach ($resource in $imports) {
        Write-Host "Importing $($resource.Address)..."
        terraform import $resource.Address $resource.Id
        if ($LASTEXITCODE -ne 0) {
            throw "terraform import of $($resource.Address) failed with exit code $LASTEXITCODE."
        }
    }

    Write-Host "Imported $($imports.Count) existing resource(s) into workspace '$targetResourceGroup'."
}
finally {
    Pop-Location
}
