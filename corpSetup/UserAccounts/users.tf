data "azuread_users" "existing" {
  return_all = true
}

// check if domain is verified and is the root domain (default domain)
data "azuread_domains" "primary" {
  only_default = true
}

locals {
  # loads users.csv -> used to create azuread_user
  users_csv = csvdecode(file("${path.module}/users.csv"))
  # map users by UPN from CSV
  users_map = {
    for u in local.users_csv : lower(u.Upn) => u
  }
  users_existing = {
    for u in data.azuread_users.existing.users : lower(u.user_principal_name) => { object_id = u.object_id, upn = u.user_principal_name }
  }
  users_to_create = {
    for k, v in local.users_map : k => v
  }
  # Map UPN to object ID for all users (created and existing)
  user_object_ids = {
    for upn, user in merge(local.users_existing, azuread_user.users) : lower(upn) => user.object_id
  }
  # Map user UPN to their manager's UPN (only non-empty)
  user_managers = {
    for upn, user in local.users_map : lower(upn) => lower(user.ManagerUpn)
    if try(user.ManagerUpn, "") != ""
  }
}

resource "azuread_user" "users" {
  for_each = local.users_to_create

  user_principal_name   = each.value.Upn
  display_name          = each.value.DisplayName
  given_name            = each.value.Name
  surname               = each.value.LastName
  country               = each.value.Location
  mail_nickname         = replace(lower("${each.value.Name}${each.value.LastName}"), " ", "")
  account_enabled       = true
  mail                  = each.value.PrimaryEmail
  other_mails           = [for email in [for e in split(",", each.value.OtherEmail) : trimspace(e) if trimspace(e) != ""] : email]
  password              = "Th3 specified password does not comply with password complexity requirements!!"
  force_password_change = false #TODO: change to true after demonstration
  lifecycle {
    ignore_changes = [manager_id]
  }
}

resource "msgraph_resource_action" "assign_managers" {
  for_each     = local.user_managers
  resource_url = "users/${local.user_object_ids[each.key]}/manager/$ref"
  api_version  = "v1.0"
  method       = "PUT"
  body = {
    "@odata.id" = "https://graph.microsoft.com/v1.0/users/${local.user_object_ids[each.value]}"
  }
  depends_on = [azuread_user.users]
}

// enables FIDO2 for all users
resource "msgraph_update_resource" "enable_fido2" {
  url         = "policies/authenticationMethodsPolicy/authenticationMethodConfigurations/Fido2"
  api_version = "v1.0"
  body = {
    state = "enabled"
    includeTargets = [
      {
        "@odata.type"          = "#microsoft.graph.authenticationMethodTarget"
        id                      = "all_users"
        targetType              = "group"
        isRegistrationRequired  = false
      }
    ]
  }
}

output "created_users" {
  description = "Created users keyed by UPN for post-apply CSV export"
  value = {
    for upn, u in azuread_user.users : upn => {
      user_principal_name = u.user_principal_name
      object_id           = u.object_id
    }
  }
}