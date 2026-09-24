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