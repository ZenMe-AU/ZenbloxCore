terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }
  required_version = ">= 1.4.0"
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
  # storage_use_azuread = true
}

data "azurerm_client_config" "current" {}
