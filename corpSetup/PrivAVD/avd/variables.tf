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

variable "subnet_id" {
  description = "Existing subnet where the session-host NICs will be created."
  type        = string
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
  default     = "Standard_D4s_v5"
}

variable "session_host_count" {
  description = "Number of session hosts to create. Hosts are deallocated when unused."
  type        = number
  default     = 2

  validation {
    condition     = var.session_host_count > 0
    error_message = "session_host_count must be greater than zero."
  }
}

variable "administrator_username" {
  description = "Local administrator account created on each session host."
  type        = string
  default     = "avdadmin"
}

variable "administrator_password" {
  description = "Local administrator password created on each session host."
  type        = string
  sensitive   = true
}

variable "domain_name" {
  description = "AD DS DNS domain used to join session hosts."
  type        = string
}

variable "domain_join_username" {
  description = "AD DS account allowed to join computers to the domain."
  type        = string
  sensitive   = true
}

variable "domain_join_password" {
  description = "Password for the AD DS domain-join account."
  type        = string
  sensitive   = true
}

variable "domain_ou_path" {
  description = "Optional distinguished name of the OU for session hosts."
  type        = string
  default     = ""
}

variable "domain_join_options" {
  description = "JsonADDomainExtension options. 3 enables secure credential handling."
  type        = number
  default     = 3
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