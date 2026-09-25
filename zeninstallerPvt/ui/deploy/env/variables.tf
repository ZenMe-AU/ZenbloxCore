variable "subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "location" {
  description = "Azure region"
  type        = string
  default     = "Australia East"
}

variable "resource_group_name" {
  description = "Resource group name"
  type        = string
}

variable "log_analytics_workspace_name" {
  description = "Log Analytics Workspace name"
  type        = string
}

variable "application_insights_name" {
  description = "Application Insights name"
  type        = string
}

variable "key_vault_name" {
  description = "Key Vault name"
  type        = string
}

variable "storage_account_name" {
  description = "Storage account name"
  type        = string
}

variable "function_app_name" {
  description = "Function App name"
  type        = string
}

variable "allowed_origins" {
  description = "Allowed origin list for CORS, use comma to separate multiple origins"
  type        = string
  default     = ""
}

# Secrets - these will be stored in Key Vault, so we can mark them as sensitive and give them default empty values
variable "oauth_secret" {
  sensitive   = true
  description = "OAuth secret"
  type        = string
  default     = "" # placeholder, should be overridden by next step, and will be stored in Key Vault
}
