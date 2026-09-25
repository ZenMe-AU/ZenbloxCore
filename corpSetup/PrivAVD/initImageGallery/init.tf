terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
  required_version = ">= 1.1.0"
}

provider "azurerm" {
  features {}
  subscription_id = var.SUBSCRIPTION_ID
}

resource "azurerm_resource_group" "paw_image" {
  name     = var.GALLERY_RG
  location = var.PAW_LOCATION

  tags = {
    purpose = "paw-golden-image"
  }
}

# Packer's shared_image_gallery_destination only adds an image version - the
# gallery and image definition must already exist before a build runs.
resource "azurerm_shared_image_gallery" "paw" {
  name                = var.GALLERY_RG
  resource_group_name = azurerm_resource_group.paw_image.name
  location            = azurerm_resource_group.paw_image.location
  description         = "Golden images for Privileged Access Workstations"
}

resource "azurerm_shared_image" "paw" {
  name                = var.IMAGE_NAME
  gallery_name        = azurerm_shared_image_gallery.paw.name
  resource_group_name = azurerm_resource_group.paw_image.name
  location            = azurerm_resource_group.paw_image.location
  os_type             = "Windows"
  hyper_v_generation  = "V2"

  identifier {
    publisher = var.IMAGE_PUBLISHER
    offer     = var.IMAGE_OFFER
    sku       = var.IMAGE_SKU
  }
}
