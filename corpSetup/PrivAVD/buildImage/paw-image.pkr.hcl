# Packer template that builds the Windows golden image for Privileged Access
# Workstations (PAW) used with Azure Virtual Desktop.

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

variable "SUBSCRIPTION_ID" {
  description = "Azure subscription used for the image build"
  type        = string
  default     = "51d0ca21-eaa5-4d34-aeb3-fa9f7d454b5d"
}

variable "PAW_LOCATION" {
  description = "Azure region where the build VM and image are created"
  type        = string
}

variable "BUILD_VM_SIZE" {
  description = "Size of the temporary VM used during the image build"
  type        = string
  default     = "Standard_B4ms"
}

variable "GALLERY_RG" {
  description = "Name used for both the Azure Compute Gallery resource group and gallery"
  type        = string
  default     = "privavd"
}

variable "IMAGE_NAME" {
  description = "Gallery image definition name (stable handle, never changes)"
  type        = string
  default     = "PrivilegedWorkstation"
}

variable "IMAGE_VERSION" {
  description = "Gallery image version (semver); build.ps1 auto-generates this from the current time so every build adds a new version"
  type        = string
  default     = "1.0.0"
}

source "azure-arm" "paw" {
  use_azure_cli_auth = true
  subscription_id    = var.SUBSCRIPTION_ID

  location = var.PAW_LOCATION
  vm_size  = var.BUILD_VM_SIZE
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

  shared_image_gallery_destination {
    subscription         = var.SUBSCRIPTION_ID
    resource_group       = var.GALLERY_RG
    gallery_name         = var.GALLERY_RG
    image_name           = var.IMAGE_NAME
    image_version        = var.IMAGE_VERSION
    replication_regions  = [var.PAW_LOCATION]
    storage_account_type = "Standard_LRS"
  }
  shared_image_gallery_timeout = "60m"
}

build {
  sources = ["source.azure-arm.paw"]

  provisioner "powershell" {
    script = "img-harden-paw.ps1"
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

  provisioner "powershell" {
    script = "img-generalize.ps1"
  }
}