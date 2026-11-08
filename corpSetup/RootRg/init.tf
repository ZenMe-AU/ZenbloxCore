terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    msgraph = {
      source  = "microsoft/msgraph"
      version = "~> 0.3"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
  }
  required_version = ">= 1.1.0"
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

provider "msgraph" {}

provider "azuread" {}
