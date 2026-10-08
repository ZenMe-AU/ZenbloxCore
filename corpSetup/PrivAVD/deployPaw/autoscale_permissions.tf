data "azuread_service_principal" "avd" {
  client_id = "9cdead84-a844-4324-93f2-b2e6bb768d07"
}

resource "azurerm_role_assignment" "avd_power_management" {
  scope                            = "/subscriptions/${var.SUBSCRIPTION_ID}"
  role_definition_name             = "Desktop Virtualization Power On Off Contributor"
  principal_id                     = data.azuread_service_principal.avd.object_id
  principal_type                   = "ServicePrincipal"
  skip_service_principal_aad_check = true
  lifecycle {
    # The skip flag only matters at creation. Imported assignments report it
    # as false in state, and role assignments cannot be updated in place -
    # without ignore_changes, every plan after an import attempts an
    # impossible in-place update and the apply fails.
    ignore_changes = [skip_service_principal_aad_check]
  }
}