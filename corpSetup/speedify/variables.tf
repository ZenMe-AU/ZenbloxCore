
# Define variables for the environment deployment
variable "subscription_id" {
  description = "The active Azure subscription ID used for the Speedify deployment"
  type        = string
  default     = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"

  validation {
    condition     = can(regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$", var.subscription_id))
    error_message = "subscription_id must be a valid Azure subscription UUID."
  }
}

variable "admin_password" {
  description = "VM admin password used to access speedifyVM; provide via TF_VAR_admin_password"
  type        = string
  sensitive   = true

  validation {
    condition     = length(var.admin_password) >= 12 && length(var.admin_password) <= 123
    error_message = "admin_password must be between 12 and 123 characters."
  }
}

variable "contact_emails" {
  description = "Comma-separated email addresses for Speedify subscription budget notifications"
  type        = string
  default     = "jake.vosloo@zenme.com.au"

  validation {
    condition     = alltrue([for email in split(",", var.contact_emails) : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", trimspace(email)))])
    error_message = "contact_emails must contain one or more valid comma-separated email addresses."
  }
}

variable "gallery_name" {
  description = "Azure Compute Gallery holding the Packer-built image (corp.env: SPEEDIFY_GALLERY_NAME)"
  type        = string
}

variable "image_name" {
  description = "Gallery image definition to boot the VM from (corp.env: SPEEDIFY_IMAGE_NAME)"
  type        = string
}

