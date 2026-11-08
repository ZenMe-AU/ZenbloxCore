# terraform {
#   required_providers {
#     azurerm = {
#       source  = "hashicorp/azurerm"
#       version = "~> 4.0"
#     }

#     msgraph = {
#       source = "microsoft/msgraph"
#     }
#   }
#   required_version = ">= 1.1.0"
# }

# variable "resource_group_name" {
#   description = "The name of the resource group"
#   type        = string
# }

# variable "dns_name" {
#   description = "The DNS name for the environment"
#   type        = string
# }

// create users — used to construct user principal names (email)
# variable "domain" {
#   type        = string
#   description = "Primary email domain for users (e.g. contoso.com) - must be registered with Entra ID"
#   default     = "ryworkzegmail.onmicrosoft.com"
# }

# variable "dns_name" {
#   type        = string
#   description = "Custom domain to add to the tenant and verify"
#   default     = "z3nm3.com.au"
# }


// Check for existing domains
# data "msgraph_resource_action" "existing_domains" {
#   api_version  = "v1.0"
#   method       = "GET"
#   resource_url = "domains"

#   response_export_values = {
#     domains = "value"
#   }
# }
data "azuread_domains" "all" {
  include_unverified = true
}

locals {
  domain_exists   = contains(data.azuread_domains.all.domains[*].domain_name, var.dns_name)
  domain_verified = anytrue([for d in data.azuread_domains.all.domains : d.verified if d.domain_name == var.dns_name])
}

// creating custom domain — only if it doesn't already exist
resource "msgraph_resource_action" "create_domain" {
  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains"

  body = { id = var.dns_name }

  count = local.domain_exists ? 0 : 1
}

data "msgraph_resource_action" "dns_name_verify" {
  api_version  = "v1.0"
  method       = "GET"
  resource_url = "domains/${var.dns_name}/verificationDnsRecords"

  response_export_values = {
    records = "value"
  }

  # Only fetch when domain exists but is not yet verified.
  # If domain doesn't exist yet, create_domain resource handles creation first (separate apply).
  count = local.domain_exists && !local.domain_verified ? 1 : 0

  depends_on = [msgraph_resource_action.create_domain]
}

# locals {
#   # Create a list of existing domain IDs
#   existing_ids = [for d in data.msgraph_resource_action.existing_domains.output.domains : d.id]

#   # Determine if we need to create the record (Empty map if exists, 1-item map if missing)
#   create_verify_record = contains(local.existing_ids, var.dns_name) ? {} : { "create" = true }
# }

resource "azurerm_dns_txt_record" "verify" {
  #for_each = local.create_verify_record

  name                = "@"
  zone_name           = var.dns_name
  resource_group_name = var.resource_group_name
  ttl                 = 3600

  

  record {
    # Fetches the MS verification token from the Graph API
    #value = length(data.msgraph_resource_action.dns_name_verify) > 0 ? data.msgraph_resource_action.dns_name_verify[0].output.records[0].text : ""
    value = try(data.msgraph_resource_action.dns_name_verify[0].output.records[0].text, "MS=already-verified")
  }

  # Ensures the record remains in Azure after successful domain verification
  lifecycle {
    ignore_changes = [record]
  }

  # Ensure the resource group and DNS zone exist before creating the TXT record
  depends_on = [
    azurerm_dns_zone.dns_zone,
    azurerm_resource_group.root_rg,
  ]
}

