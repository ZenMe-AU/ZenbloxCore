variable "SUBSCRIPTION_ID" {
  description = "Azure subscription that contains the AVD deployment."
  type        = string
}

variable "PAW_LOCATION" {
  description = "Azure region for the AVD resources."
  type        = string
}

variable "VIRTUAL_NETWORK_ADDRESS_SPACE" {
  description = "Address space for the isolated AVD virtual network."
  type        = string
  default     = "10.250.0.0/16"
}

variable "FIREWALL_SUBNET_ADDRESS_PREFIX" {
  description = "Address prefix for AzureFirewallSubnet. Must be /26 or larger."
  type        = string
  default     = "10.250.0.0/26"
}

variable "SESSION_HOST_SUBNET_ADDRESS_PREFIX" {
  description = "Address prefix for the isolated AVD session-host subnet."
  type        = string
  default     = "10.250.1.0/24"
}

variable "GALLERY_RG" {
  description = "Name used for both the existing Azure Compute Gallery resource group and gallery."
  type        = string
  default     = "paw-gallery"
}

variable "IMAGE_NAME" {
  description = "Existing gallery image definition name."
  type        = string
  default     = "PrivilegedWorkstation"
}

variable "IMAGE_VERSION" {
  description = "Exact gallery image version published by build.ps1, for example 1.0.1720000000."
  type        = string
}

variable "HOST_POOL_NAME" {
  description = "Azure Virtual Desktop host pool name."
  type        = string
  default     = "paw"
}

variable "WORKSPACE_NAME" {
  description = "Azure Virtual Desktop workspace name."
  type        = string
  default     = "privavd-workspace"
}

variable "APPLICATION_GROUP_NAME" {
  description = "Azure Virtual Desktop desktop application group name."
  type        = string
  default     = "privavd-desktop"
}

variable "VM_SIZE" {
  description = "Size of each pooled session host."
  type        = string
  default     = "Standard_D4s_v4"
}

variable "SESSION_HOST_COUNT" {
  description = "Number of session hosts. This PAW deployment is restricted to one host."
  type        = number
  default     = 1

  validation {
    condition     = var.SESSION_HOST_COUNT == 1
    error_message = "SESSION_HOST_COUNT must be exactly one for this PAW deployment."
  }
}

variable "ADMINISTRATOR_USERNAME" {
  description = "Local administrator account created on each session host."
  type        = string
  default     = "avdadmin"
}

variable "TIMEZONE" {
  description = "Scaling-plan timezone in Windows timezone format."
  type        = string
  default     = "Eastern Standard Time"
}

variable "TAGS" {
  description = "Tags applied to the resource group and session hosts."
  type        = map(string)
  default = {
    workload = "privileged-access-workstation"
    managed  = "terraform"
  }
}

variable "PAW_GROUP" {
  description = "Entra ID group created for PAW sign-in access."
  type        = string
  default     = "PawUsers"
}

variable "ENABLE_PIM" {
  description = "Whether to create the eligible Desktop Virtualization User assignment."
  type        = bool
  default     = false
}

variable "PRIVATE_ENDPOINTS_SUBNET_ADDRESS_PREFIX" {
  description = "Address prefix for the private-endpoints subnet hosting the AVD connection private endpoint."
  type        = string
  default     = "10.250.2.0/26"
}

variable "BLOB_PRIVATE_DNS_ZONE_ID" {
  description = "Existing privatelink.blob.core.windows.net zone already linked to this VNet. Empty = create one here (fresh deployments)."
  type        = string
  default     = ""
}

variable "ARTIFACT_KEEPER_BLOB_HOST" {
  description = "Artifact Keeper private blob host, e.g. erv8stakacaprivate.blob.core.windows.net. Set = session hosts trust it as a Local Intranet site so winget installs from it run unattended. Empty = skip."
  type        = string
  default     = ""

  validation {
    condition     = var.ARTIFACT_KEEPER_BLOB_HOST == "" || can(regex("^[a-z0-9]{3,24}\\.blob\\.core\\.windows\\.net$", var.ARTIFACT_KEEPER_BLOB_HOST))
    error_message = "ARTIFACT_KEEPER_BLOB_HOST must be empty or <storage-account>.blob.core.windows.net (lowercase)."
  }
}

variable "FILE_PRIVATE_DNS_ZONE_ID" {
  description = "Existing privatelink.file.core.windows.net zone already linked to this VNet. Empty = create one here (fresh deployments)."
  type        = string
  default     = ""
}

variable "ARTIFACT_KEEPER_FILE_SHARE" {
  description = "true = the Artifact Keeper private storage also serves a read-only SMB share (ZbArtifactKeeper TF_VAR_PRIVATE_FILE_SHARE_NAME). Session hosts then get cloud Kerberos tickets at sign-in, so users map the share with their Entra account, and trust its file host as a Local Intranet site. Takes effect at each session host's next restart."
  type        = bool
  default     = false

  validation {
    condition     = !var.ARTIFACT_KEEPER_FILE_SHARE || var.ARTIFACT_KEEPER_BLOB_HOST != ""
    error_message = "ARTIFACT_KEEPER_FILE_SHARE=true needs ARTIFACT_KEEPER_BLOB_HOST: the share lives on the same Artifact Keeper private storage account."
  }
}

variable "ARTIFACT_KEEPER_FILE_SHARE_NAME" {
  description = "Name of the Artifact Keeper read-only file share; must equal the AK stack's TF_VAR_PRIVATE_FILE_SHARE_NAME. Used by the sign-in tasks (ARTIFACT_KEEPER_FILE_SHARE=true)."
  type        = string
  default     = "paw-approved"

  validation {
    condition     = can(regex("^[a-z0-9](?:[a-z0-9]|-[a-z0-9]){2,62}$", var.ARTIFACT_KEEPER_FILE_SHARE_NAME))
    error_message = "ARTIFACT_KEEPER_FILE_SHARE_NAME must be a valid Azure file share name: 3-63 lowercase letters, digits and single hyphens."
  }
}

variable "ARTIFACT_KEEPER_DRIVE_LETTER" {
  description = "Drive letter the sign-in task maps the Artifact Keeper file share to for every user (default P). Empty = do not map a drive."
  type        = string
  default     = "P"

  validation {
    condition     = can(regex("^([D-Zd-z])?$", var.ARTIFACT_KEEPER_DRIVE_LETTER))
    error_message = "ARTIFACT_KEEPER_DRIVE_LETTER must be one letter D-Z, or empty."
  }
}

variable "PAW_USER_TOOLS" {
  description = "true (default) = at every sign-in, install the developer tools listed in Installers/paw-user-tools.json on the Artifact Keeper file share for that user, without admin rights. Needs ARTIFACT_KEEPER_FILE_SHARE=true."
  type        = bool
  default     = true
}

variable "CLIPBOARD_MODE" {
  description = "Clipboard between the user's device and the PAW: \"paste-in\" (default) = plain text can be pasted INTO the session, nothing can be copied out; \"two-way\" = no restriction (testing only); \"off\" = no clipboard. Enforced on each session host by scripts/Set-PawRedirectionPolicy.ps1; takes effect after the session host's next restart."
  type        = string
  default     = "paste-in"

  validation {
    condition     = contains(["paste-in", "two-way", "off"], var.CLIPBOARD_MODE)
    error_message = "CLIPBOARD_MODE must be paste-in, two-way or off."
  }
}
