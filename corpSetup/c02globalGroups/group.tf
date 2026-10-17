# New Entra ID group granted sign-in access to the PAW desktop.
resource "azuread_group" "paw_login" {
  display_name     = var.PAW_GROUP
  security_enabled = true
}

resource "azuread_group" "privileged_accounts" {
  display_name       = "PrivilegedAccounts"
  description        = "All enabled privileged accounts"
  security_enabled   = true
  assignable_to_role = true
}

resource "azuread_group_member" "paw_login" {
  group_object_id  = azuread_group.paw_login.object_id
  member_object_id = azuread_group.privileged_accounts.object_id
}

resource "azuread_directory_role" "global_administrator" {
  display_name = "Global Administrator"
}

resource "azuread_directory_role_assignment" "global_administrator" {
  role_id             = azuread_directory_role.global_administrator.template_id
  principal_object_id = azuread_group.privileged_accounts.object_id
}

data "azurerm_client_config" "current" {}

data "azurerm_management_group" "root" {
  name = data.azurerm_client_config.current.tenant_id
}

resource "azurerm_role_assignment" "privileged_accounts_owner" {
  scope                = data.azurerm_management_group.root.id
  role_definition_name = "Owner"
  principal_id         = azuread_group.privileged_accounts.object_id
}

# # Eligible, P2 License Required
# resource "azuread_directory_role_eligibility_schedule_request" "global_administrator" {
#   role_definition_id = azuread_directory_role.global_administrator.template_id
#   principal_id       = azuread_group.privileged_accounts.object_id
#   directory_scope_id = "/"
#   justification      = "Privileged accounts activate Global Administrator through PIM"
# }

# data "azurerm_role_definition" "owner" {
#   name  = "Owner"
#   scope = data.azurerm_management_group.root.id
# }
#
# resource "azurerm_pim_eligible_role_assignment" "privileged_accounts_owner" {
#   scope              = data.azurerm_management_group.root.id
#   role_definition_id = data.azurerm_role_definition.owner.id
#   principal_id       = azuread_group.privileged_accounts.object_id
#   justification      = "Privileged accounts activate Owner through PIM"
# }
