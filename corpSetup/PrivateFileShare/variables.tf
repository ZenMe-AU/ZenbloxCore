
# Define variables for the environment deployment
variable "subscription_id" {
  description = "The ID of the Azure Subscription"
  type        = string
}

variable "PRIV_SHARE" {
  description = "Name of the private file share resource group"
  type        = string
}

variable "location" {
  description = "Azure location for resources"
  type        = string
  default     = "australiaeast"
}

variable "VIRTUAL_NETWORK_ADDRESS_SPACE" {
  description = "Address space for the private file share virtual network"
  type        = string
  default     = "10.251.0.0/16"
}

variable "SERVICE_ACCESS_SUBNET_ADDRESS_PREFIX" {
  description = "Address prefix for the Azure Storage service-access subnet"
  type        = string
  default     = "10.251.2.0/26"
}
