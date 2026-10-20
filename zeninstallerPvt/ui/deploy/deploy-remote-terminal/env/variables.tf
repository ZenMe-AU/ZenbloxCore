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

variable "storage_account_name" {
  description = "Storage account name — holds the session table and the Function App's deployment container"
  type        = string
}

variable "session_table_name" {
  description = "Table the backend stores terminal sessions in"
  type        = string
  default     = "sessions"
}

variable "web_pubsub_name" {
  description = "Web PubSub instance name"
  type        = string
}

variable "web_pubsub_sku" {
  description = "Web PubSub SKU — Free_F1 caps at 20 concurrent connections and 20k messages a day; Standard_S1 scales"
  type        = string
  default     = "Free_F1"
}

variable "web_pubsub_capacity" {
  description = "Web PubSub unit count — Free_F1 only allows 1"
  type        = number
  default     = 1
}

variable "hub_name" {
  description = "Web PubSub hub the session groups live in"
  type        = string
  default     = "terminal"
}

variable "function_app_name" {
  description = "Function App name — serves register/negotiate/session/health"
  type        = string
}

variable "allowed_origins" {
  description = "Allowed origin list for CORS, use comma to separate multiple origins. The browser calls /register and /negotiate directly, so the ZenInstaller origin has to be listed here."
  type        = string
  default     = ""
}

variable "pipeline_app_name" {
  description = "App registration GitHub Actions signs in as to reach Web PubSub"
  type        = string
}

variable "github_oidc_subjects" {
  description = "Exact sub claims to trust, one per GitHub environment. Copy the format from an existing federated credential on the pipeline repo — this repo opts into immutable OIDC subjects, so the claim is not always repo:OWNER/NAME:environment:ENV."
  type        = list(string)
}
