# Packer template that builds the Windows golden image for Privileged Access
# Workstations (PAW) used with Azure Virtual Desktop.
#
# The build boots a Windows 11 Enterprise multi-session VM (no Microsoft 365
# apps, since a PAW doesn't run client productivity apps), hardens it,
# installs Windows Updates, captures it as a managed image, and deletes the
# temporary resources.
#
# Build (from this directory):
#   packer init .
#   packer validate paw-image.pkr.hcl
#   packer build paw-image.pkr.hcl

packer {
  required_plugins {
    azure = {
      version = ">= 1.1.1"
      source  = "github.com/hashicorp/azure"
    }
    windows-update = {
      version = ">= 0.14.3"
      source  = "github.com/rgl/windows-update"
    }
  }
}

variable "subscription_id" {
  description = "Azure subscription used for the image build"
  type        = string
  default     = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"
}

variable "location" {
  description = "Azure region where the build VM and image are created"
  type        = string
  default     = "eastus"
}

variable "IMAGE_RG" {
  description = "Existing resource group that receives the built managed image"
  type        = string
  default     = "privavd"
}

variable "build_vm_size" {
  description = "Size of the temporary VM used during the image build"
  type        = string
  default     = "Standard_B4ms"
}

variable "gallery_rg" {
  description = "Resource group that contains the Azure Compute Gallery"
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
variable "image_version" {
  description = "Gallery image version (semver); build.ps1 auto-generates this from the current time so every build adds a new version"
  type        = string
  default     = "1.0.0"
}
source "azure-arm" "paw" {
  use_azure_cli_auth = true
  subscription_id = var.subscription_id

  location = var.location
  vm_size  = var.build_vm_size
  os_type  = "Windows"

  image_publisher = "MicrosoftWindowsDesktop"
  image_offer     = "windows-11"
  image_sku       = "win11-24h2-avd"
  image_version   = "latest"

    communicator   = "winrm"
  winrm_use_ssl  = true
  winrm_insecure = true
  winrm_timeout  = "15m"
  winrm_username = "packer"

  azure_tags = {
    purpose = "paw-golden-image"
    builtBy = "packer"
  }

  # DESTINATION: publish the build straight into the Azure Compute Gallery
  # image definition. build.ps1 passes a fresh image_version per run, so
  # each build adds a new version instead of colliding with the last one.
  shared_image_gallery_destination {
    subscription        = var.subscription_id
    resource_group      = var.gallery_rg
    gallery_name        = var.gallery_name
    image_name          = var.image_name
    image_version       = var.image_version
    replication_regions = [var.location]
    storage_account_type = "Standard_LRS"
  }
  shared_image_gallery_timeout = "60m"
}

build {
  sources = ["source.azure-arm.paw"]

  # Baseline PAW hardening: reduce attack surface before applying updates.
  # See scripts/harden-paw.ps1 - safe to run directly on a test VM.
  provisioner "powershell" {
    script = "scripts/harden-paw.ps1"
  }

#   provisioner "windows-update" {
#     search_criteria = "IsInstalled=0"
#     filters = [
#       "exclude:$_.Title -like '*Preview*'",
#       "include:$true"
#     ]
#   }

  provisioner "windows-restart" {
    restart_timeout = "15m"
  }

  # Generalize before capture. See scripts/generalize.ps1.
  provisioner "powershell" {
    script = "scripts/generalize.ps1"
  }
}
