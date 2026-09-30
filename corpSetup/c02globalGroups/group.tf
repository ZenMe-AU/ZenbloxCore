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
