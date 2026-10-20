# Set this as VITE_REMOTE_TERMINAL_API in web/.env
output "remote_terminal_api" {
  description = "Session backend base URL for the ZenInstaller browser"
  value       = "https://${azurerm_function_app_flex_consumption.fa.default_hostname}/api"
}

# A bare host, deliberately: the runner agent prefixes it with https:// itself, so a scheme here
# would produce https://wss://host and DNS would be asked to resolve "wss".
output "web_pubsub_endpoint" {
  description = "Web PubSub host for the WEBPUBSUB_ENDPOINT variable on the pipeline repo"
  value       = azurerm_web_pubsub.wps.hostname
}

output "web_pubsub_hub" {
  description = "Hub name for the HUB_NAME variable on the pipeline repo"
  value       = azurerm_web_pubsub_hub.hub.name
}

# The Function App does not use this — it goes to the pipeline repo, whose runner agent still signs
# its own client token with the key. Drop it once that side moves to federated OIDC.
output "web_pubsub_key" {
  description = "Web PubSub access key for the WEBPUBSUB_KEY secret on the pipeline repo"
  value       = azurerm_web_pubsub.wps.primary_access_key
  sensitive   = true
}

# The scope to grant "Web PubSub Service Owner" on when the runner moves off the access key.
output "web_pubsub_id" {
  description = "Resource ID of the Web PubSub instance"
  value       = azurerm_web_pubsub.wps.id
}

output "function_app_name" {
  description = "Function App the session backend is deployed to"
  value       = azurerm_function_app_flex_consumption.fa.name
}

output "resource_group_name" {
  description = "Resource group holding the remote terminal infrastructure"
  value       = azurerm_resource_group.rg.name
}

output "storage_account_name" {
  description = "Storage account holding the session table"
  value       = azurerm_storage_account.sa.name
}

# Set these two as variables on the pipeline repo, then WEBPUBSUB_KEY can be deleted.
output "pipeline_client_id" {
  description = "Client id for the WEBPUBSUB_CLIENT_ID variable on the pipeline repo"
  value       = azuread_application.pipeline.client_id
}

output "pipeline_tenant_id" {
  description = "Tenant id for the WEBPUBSUB_TENANT_ID variable on the pipeline repo"
  value       = data.azurerm_client_config.current.tenant_id
}
