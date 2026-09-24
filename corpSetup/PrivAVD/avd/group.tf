# New Entra ID group granted sign-in access to the PAW desktop.
resource "azuread_group" "paw_login" {
  display_name     = var.paw_login_group_display_name
  security_enabled = true
}

# resource "azuread_group_member" "paw_login" {
#   for_each         = toset(var.paw_login_group_member_object_ids)
#   group_object_id  = azuread_group.paw_login.object_id
#   member_object_id = each.value
# }

# "Desktop Virtualization User" lets members enumerate and launch this application group; it does not grant Azure resource access.
resource "azurerm_role_assignment" "paw_login_desktop" {
  scope                = azurerm_virtual_desktop_application_group.desktop.id
  role_definition_name = "Desktop Virtualization User"
  principal_id         = azuread_group.paw_login.object_id
}

# "Virtual Machine User Login" lets members complete Entra ID authentication on the session hosts themselves.
resource "azurerm_role_assignment" "paw_login_vm" {
  scope                = azurerm_resource_group.avd.id
  role_definition_name = "Virtual Machine User Login"
  principal_id         = azuread_group.paw_login.object_id
}

