terraform init

# Load KEY=VALUE pairs from .env in this folder as process environment
# variables, so Terraform auto-picks up the TF_VAR_* ones.
Get-Content (Join-Path $PSScriptRoot ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Item -Path "Env:$($Matches[1].Trim())" -Value $Matches[2].Trim()
    }
}

# Resources can already exist from a previous manual/ps1 run - import any that aren't tracked in state yet instead of letting `apply` fail with "already exists". Safe to re-run.
$resources = @{
    "azurerm_resource_group.paw_image" = "/subscriptions/$env:TF_VAR_subscription_id/resourceGroups/$env:TF_VAR_IMAGE_RG"
    "azurerm_shared_image_gallery.paw" = "/subscriptions/$env:TF_VAR_subscription_id/resourceGroups/$env:TF_VAR_IMAGE_RG/providers/Microsoft.Compute/galleries/$env:TF_VAR_gallery_name"
    "azurerm_shared_image.paw"         = "/subscriptions/$env:TF_VAR_subscription_id/resourceGroups/$env:TF_VAR_IMAGE_RG/providers/Microsoft.Compute/galleries/$env:TF_VAR_gallery_name/images/$env:TF_VAR_image_name"
}

$state = terraform state list
foreach ($address in $resources.Keys) {
    if (-not ($state | Select-String ([regex]::Escape($address)))) {
        # Ignore failures here - on first-ever run these resources don't
        # exist in Azure yet either, so `apply` will create them instead.
        terraform import $address $resources[$address] 2>$null
    }
}

terraform apply
