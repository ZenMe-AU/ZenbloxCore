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
