terraform {
  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
    msgraph = {
      source  = "microsoft/msgraph"
      version = "~> 0.3"
    }
  }
  required_version = ">= 1.1.0"
}

provider "azurerm"  {
  features {}
  subscription_id = var.subscription_id
  # client_id       = var.client_id
  # client_secret   = var.client_secret
  # tenant_id       = var.tenant_id
}

provider "msgraph" {
  # client_id     = var.client_id
  # client_secret = var.client_secret
  # tenant_id     = var.tenant_id
}