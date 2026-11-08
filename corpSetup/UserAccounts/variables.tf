
# Define variables for the environment deployment

# The target environment will automatically load from the environment variable TF_VAR_target_env
variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}

# variable "client_id" {
#   description = "The client ID of the Azure AD application used for authentication"
#   type        = string
# }

# variable "client_secret" {
#   description = "The client secret of the Azure AD application used for authentication"
#   type        = string
#   sensitive   = true
# }

# variable "tenant_id" {
#   description = "The tenant ID of the Azure AD application used for authentication"
#   type        = string
# }

variable "dns_name" {
  description = "The DNS name for the environment"
  type        = string
}