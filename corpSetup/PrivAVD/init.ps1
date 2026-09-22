terraform init

# Load KEY=VALUE pairs from .env in this folder into script variables.
Get-Content (Join-Path $PSScriptRoot ".env") | ForEach-Object {
    if ($_ -match '^\s*([^#=][^=]*)=(.*)$') {
        Set-Variable -Name $Matches[1].Trim() -Value $Matches[2].Trim()
    }
}

# Resources can already exist from a previous manual/ps1 run - import any that aren't tracked in state yet instead of letting `apply` fail with "already exists". Safe to re-run.
$resources = @{
    "azurerm_resource_group.paw_image" = "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$IMAGE_RESOURCE_GROUP"
    "azurerm_shared_image_gallery.paw" = "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$IMAGE_RESOURCE_GROUP/providers/Microsoft.Compute/galleries/$GALLERY_NAME"
    "azurerm_shared_image.paw"         = "/subscriptions/$SUBSCRIPTION_ID/resourceGroups/$IMAGE_RESOURCE_GROUP/providers/Microsoft.Compute/galleries/$GALLERY_NAME/images/$IMAGE_NAME"
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
