
# Define variables for the environment deployment
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
