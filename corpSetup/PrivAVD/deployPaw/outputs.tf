output "host_pool_id" {
  description = "ID of the pooled AVD host pool."
  value       = azurerm_virtual_desktop_host_pool.pooled.id
}

output "workspace_id" {
  description = "ID of the AVD workspace."
  value       = azurerm_virtual_desktop_workspace.workspace.id
}

output "desktop_application_group_id" {
  description = "ID of the desktop application group."
  value       = azurerm_virtual_desktop_application_group.desktop.id
}

output "session_host_names" {
  description = "Names of the created pooled session hosts."
  value       = azurerm_windows_virtual_machine.session_host[*].name
}

output "registration_token" {
  description = "Short-lived host-pool registration token."
  value       = azurerm_virtual_desktop_host_pool_registration_info.pooled.token
  sensitive   = true
}

output "virtual_network_id" {
  description = "ID of the isolated AVD virtual network."
  value       = azurerm_virtual_network.avd.id
}

output "session_host_subnet_id" {
  description = "ID of the isolated session-host subnet."
  value       = azurerm_subnet.session_hosts.id
}

# Artifact Keeper integration: the two values the AK deployment needs
# (TF_VAR_PRIVATE_ENDPOINT_SUBNET_ID and TF_VAR_PRIVATE_DNS_ZONE_ID).
output "private_endpoints_subnet_id" {
  description = "ID of the private-endpoints subnet. Artifact Keeper puts its private-blob read endpoint here."
  value       = azurerm_subnet.private_endpoints.id
}

output "blob_private_dns_zone_id" {
  description = "ID of the privatelink.blob.core.windows.net zone linked to this VNet (created here or reused)."
  value       = local.blob_private_dns_zone_id
}
