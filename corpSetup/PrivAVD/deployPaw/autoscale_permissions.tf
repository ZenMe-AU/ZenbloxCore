data "azuread_service_principal" "avd" {
  client_id = "9cdead84-a844-4324-93f2-b2e6bb768d07"
}

resource "azurerm_role_assignment" "avd_power_management" {
  scope                            = azurerm_resource_group.avd.id
  role_definition_name             = "Desktop Virtualization Power On Off Contributor"
  principal_id                     = data.azuread_service_principal.avd.object_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
}