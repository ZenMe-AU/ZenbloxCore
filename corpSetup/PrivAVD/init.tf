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
  subscription_id = var.subscription_id
}

resource "azurerm_resource_group" "paw_image" {
  name     = var.image_resource_group
  location = var.location

  tags = {
    purpose = "paw-golden-image"
  }
}

# Packer's shared_image_gallery_destination only adds an image version - the
# gallery and image definition must already exist before a build runs.
resource "azurerm_shared_image_gallery" "paw" {
  name                = var.gallery_name
  resource_group_name = azurerm_resource_group.paw_image.name
  location            = azurerm_resource_group.paw_image.location
  description         = "Golden images for Privileged Access Workstations"
}

resource "azurerm_shared_image" "paw" {
  name                = var.image_name
  gallery_name        = azurerm_shared_image_gallery.paw.name
  resource_group_name = azurerm_resource_group.paw_image.name
  location            = azurerm_resource_group.paw_image.location
  os_type             = "Windows"
  hyper_v_generation  = "V2"

  identifier {
    publisher = "Zenblox"
    offer     = "PrivAVD"
    sku       = "paw-win11"
  }
}
