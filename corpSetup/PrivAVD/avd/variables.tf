variable "subscription_id" {
  description = "Azure subscription that contains the AVD deployment."
  type        = string
}

variable "location" {
  description = "Azure region for the AVD resources."
  type        = string
  default     = "eastus"
}

variable "resource_group_name" {
  description = "Resource group for the AVD control plane and session hosts."
  type        = string
  default     = "privavd-hosts"
}

variable "virtual_network_address_space" {
  description = "Address space for the isolated AVD virtual network."
  type        = string
  default     = "10.250.0.0/16"
}

variable "firewall_subnet_address_prefix" {
  description = "Address prefix for AzureFirewallSubnet. Must be /26 or larger."
  type        = string
  default     = "10.250.0.0/26"
}

variable "session_host_subnet_address_prefix" {
  description = "Address prefix for the isolated AVD session-host subnet."
  type        = string
  default     = "10.250.1.0/24"
}

variable "gallery_resource_group_name" {
  description = "Resource group containing the existing Azure Compute Gallery."
  type        = string
  default     = "paw-gallery"
}

variable "gallery_name" {
  description = "Existing Azure Compute Gallery name."
  type        = string
  default     = "PrivilegedAccessWorkstations"
}

variable "image_name" {
  description = "Existing gallery image definition name."
  type        = string
  default     = "PrivilegedWorkstation"
}

variable "image_version" {
  description = "Exact gallery image version published by build.ps1, for example 1.0.1720000000."
  type        = string
}

variable "host_pool_name" {
  description = "Azure Virtual Desktop host pool name."
  type        = string
  default     = "privavd-pooled"
}

variable "workspace_name" {
  description = "Azure Virtual Desktop workspace name."
  type        = string
  default     = "privavd-workspace"
}

variable "application_group_name" {
  description = "Azure Virtual Desktop desktop application group name."
  type        = string
  default     = "privavd-desktop"
}

variable "vm_size" {
  description = "Size of each pooled session host."
  type        = string
  default     = "Standard_D4s_v4"
}

variable "session_host_count" {
  description = "Number of session hosts. This PAW deployment is restricted to one host."
  type        = number
  default     = 1

  validation {
    condition     = var.session_host_count == 1
    error_message = "session_host_count must be exactly one for this PAW deployment."
  }
}

variable "administrator_username" {
  description = "Local administrator account created on each session host."
  type        = string
  default     = "avdadmin"
}

variable "registration_dsc_modules_url" {
  description = "Microsoft-hosted AVD session-host DSC package URL."
  type        = string
  default     = "https://wvdportalstorageblob.blob.core.windows.net/galleryartifacts/Configuration_1.0.02714.392.zip"
}

variable "timezone" {
  description = "Scaling-plan timezone in Windows timezone format."
  type        = string
  default     = "Eastern Standard Time"
}

variable "tags" {
  description = "Tags applied to the resource group and session hosts."
  type        = map(string)
  default = {
    workload = "privileged-access-workstation"
    managed  = "terraform"
  }
}

variable "paw_login_group_display_name" {
  description = "Entra ID group created for PAW sign-in access."
  type        = string
  default     = "PawUsers"
}

# variable "paw_login_group_member_object_ids" {
#   description = "Entra ID object IDs (users or groups) added as members of the created PAW login group."
#   type        = list(string)
#   default     = []
# }

