# This file is responsible for setting up AWS SSO,
# including the AWS IAM SAML provider, IAM roles,
# and Azure AD enterprise application claim policies and user group assignments.
terraform {
  required_version = ">= 1.3"

  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.0"
    }

    msgraph = {
      source = "microsoft/msgraph"
    }

    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }

    http = {
      source  = "hashicorp/http"
      version = "~> 3.0"
    }
  }
}

provider "azuread" {}

provider "msgraph" {}

provider "aws" {
  region = var.provider_region
}
