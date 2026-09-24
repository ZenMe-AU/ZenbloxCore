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
}

variable "GALLERY_RG" {
  description = "Name used for both the Azure Compute Gallery resource group and gallery."
  type        = string
  default     = "privavd"
}

variable "image_name" {
  description = "Gallery image definition name (stable handle, never changes)"
  type        = string
  default     = "PrivilegedWorkstation"
}

variable "IMAGE_PUBLISHER" {
  description = "Gallery image definition identifier: publisher"
  type        = string
  default     = "Zenblox"
}

variable "IMAGE_OFFER" {
  description = "Gallery image definition identifier: offer"
  type        = string
  default     = "PrivAVD"
}

variable "IMAGE_SKU" {
  description = "Gallery image definition identifier: sku"
  type        = string
  default     = "paw-win11"
}
