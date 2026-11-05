
data "azuread_domains" "all" {
  include_unverified = true
}

locals {
  target_domain_verified = anytrue([
    for d in data.azuread_domains.all.domains : d.verified
    if lower(d.domain_name) == lower(var.dns_name)
  ])
  target_domain_default = anytrue([
    for d in data.azuread_domains.all.domains : d.default
    if lower(d.domain_name) == lower(var.dns_name)
  ])
}

resource "msgraph_resource_action" "verify_dns_name" {
  api_version  = "v1.0"
  method       = "POST"
  resource_url = "domains/${var.dns_name}/verify"

  count = local.target_domain_verified ? 0 : 1

  # DNS verification can be eventually consistent; retry until record is visible.
  retry = {
    error_message_regex = [
      "(?i)TargetHostCannotBeResolved",
      "(?i)DNS verification",
      "(?i)InternalError"
    ]
  }

  timeouts {
    create = "2m"
  }
}

resource "msgraph_resource_action" "make_dns_name_primary" {
  api_version  = "v1.0"
  method       = "PATCH"
  resource_url = "domains/${var.dns_name}"

  count = local.target_domain_default ? 0 : 1

  body = {
    isDefault = true
  }

  depends_on = [msgraph_resource_action.verify_dns_name]
}
