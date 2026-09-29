# New Entra ID group granted sign-in access to the PAW desktop.
resource "azuread_group" "paw_login" {
  display_name     = var.PAW_GROUP
  security_enabled = true
}

resource "azuread_group" "privileged_accounts" {
  display_name     = "PrivilegedAccounts"
  description      = "All enabled privileged accounts"
  security_enabled = true

  types = ["DynamicMembership"]

  dynamic_membership {
    enabled = true
    rule    = <<-RULE
      (user.userPrincipalName -startsWith "adm_")
      and
      (user.accountEnabled -eq true)
    RULE
  }
}

resource "azuread_group_member" "paw_login" {
  group_object_id  = azuread_group.paw_login.object_id
  member_object_id = azuread_group.privileged_accounts.object_id
}
