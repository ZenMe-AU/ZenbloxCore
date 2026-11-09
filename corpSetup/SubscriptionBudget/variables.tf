
# Define variables for the environment deployment
variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}
variable "contact_emails" {
  description = "Comma-separated list of contact emails for budget notification"
  type        = string
}
