variable "subscription_id" {
  description = "Azure subscription used for the image build"
  type        = string
  default     = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id must be a valid Azure subscription UUID."
  }
}

variable "location" {
  description = "Azure region where the build VM and image are created"
  type        = string
  default     = "eastus"
}

variable "image_resource_group" {
  description = "Resource group that receives the built managed image"
  type        = string
  default     = "privavd"
}

variable "gallery_name" {
  description = "Azure Compute Gallery that receives the image version"
  type        = string
  default     = "privavd"
}

variable "image_name" {
  description = "Gallery image definition name (stable handle, never changes)"
  type        = string
  default     = "PrivilegedWorkstation"
}
