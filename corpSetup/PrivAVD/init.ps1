terraform init

$subscriptionId = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"
$imageResourceGroup = "privavd"
$galleryName = "privavd"
$imageName = "PrivilegedWorkstation"

# Resources can already exist from a previous manual/ps1 run - import any
# that aren't tracked in state yet instead of letting `apply` fail with
# "already exists". Safe to re-run.
$resources = @{
    "azurerm_resource_group.paw_image" = "/subscriptions/$subscriptionId/resourceGroups/$imageResourceGroup"
    "azurerm_shared_image_gallery.paw" = "/subscriptions/$subscriptionId/resourceGroups/$imageResourceGroup/providers/Microsoft.Compute/galleries/$galleryName"
    "azurerm_shared_image.paw"         = "/subscriptions/$subscriptionId/resourceGroups/$imageResourceGroup/providers/Microsoft.Compute/galleries/$galleryName/images/$imageName"
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
