# Define variables for the environment deployment
variable "provider_region" {
  description = "The AWS region for the provider"
  type        = string
  default     = "us-east-1"
}

variable "tenant_id" {
  description = "The Azure AD Tenant ID"
  type        = string
  # default     = "15fb0613-7977-4551-801b-6aadac824241"
}

variable "app_name" {
  description = "The name of the AWS SSO application to create in Entra ID"
  type        = string
  default     = "AWS Admin Console"
}
variable "identity_provider_name" {
  description = "The name of the identity provider"
  type        = string
  default     = "EntraID"
}
variable "role_name" {
  description = "The name of the IAM Admin role"
  type        = string
  default     = "AccountAdminRole"
}
variable "role_ro_name" {
  description = "The name of the IAM read-only role"
  type        = string
  default     = "ReadOnlyRole"
}
