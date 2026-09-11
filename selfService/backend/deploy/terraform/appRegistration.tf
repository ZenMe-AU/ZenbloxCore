/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

# Equivalent of appRegistration.mjs: creates the AccessPass-Backend-Graph2 app registration.
resource "azuread_application" "access_pass_backend" {
  display_name     = "AccessPass-Backend-Graph2"
  sign_in_audience = "AzureADMyOrg"

  # required_resource_access is managed via azuread_application_api_access instead,
  # ignore it here to avoid the two resources fighting over the same field each apply.
  lifecycle {
    ignore_changes = [required_resource_access]
  }
}

output "app_registration_client_id" {
  description = "The application (client) ID of the AccessPass-Backend-Graph2 app registration"
  value       = azuread_application.access_pass_backend.client_id
}

output "app_registration_object_id" {
  description = "The object ID of the AccessPass-Backend-Graph2 app registration"
  value       = azuread_application.access_pass_backend.object_id
}

# Service principal (enterprise application) is required before admin consent can be granted.
resource "azuread_service_principal" "access_pass_backend" {
  client_id = azuread_application.access_pass_backend.client_id
}

output "service_principal_object_id" {
  description = "The object ID of the AccessPass-Backend-Graph2 service principal"
  value       = azuread_service_principal.access_pass_backend.object_id
}

