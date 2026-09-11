# This script deploys the app registration for selfService by:
# 1. Reading the tenant ID from .env file
# 2. Creating or updating the app registration in Azure AD
# 3. Saving the app registration details back to .env

param(
    [string]$envFile
)

# If no env file path provided, use the web folder's .env
if (-not $envFile) {
    $envFile = Resolve-Path -Path "../../web/.env"
}

if (-not (Test-Path $envFile)) {
    Write-Error "Environment file not found at: $envFile"
    exit 1
}

Write-Output "Using environment file: $envFile"

# Set MODULE_FOLDER to one folder above the current directory
$env:MODULE_FOLDER = Resolve-Path -Path ".."
$env:ENV_FILE = $envFile
Write-Output "Set MODULE_FOLDER to $env:MODULE_FOLDER"

# Install dependencies
Write-Output "Installing dependencies..."
Set-Location $env:MODULE_FOLDER
pnpm install
if ($LASTEXITCODE -ne 0) {
    Write-Error "Dependency installation failed"
    exit 1
}

# Deploy Azure AD resources (app registration, groups, administrative units, permissions) via Terraform
Write-Output "`nDeploying Azure AD resources via Terraform..."
Set-Location $env:MODULE_FOLDER\deploy\code
node ./deployTerraform.js
if ($LASTEXITCODE -ne 0) {
    Write-Error "Terraform deployment failed"
    exit 1
}

Write-Output "Terraform deployment completed successfully!"