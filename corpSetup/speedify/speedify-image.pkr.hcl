# Packer template that builds the Speedify server base image.
#
# Provisioning is intentionally disabled while the build pipeline is being
# tested: the build currently boots an Ubuntu 24.04 VM, captures it as a
# managed image, and deletes the temporary resources.
#
# This is the HCL twin of speedify.json (the doc-style JSON template).
# Build only one template at a time - `packer build .` would run both.
#
# Build (from this directory):
#   packer init .
#   packer validate speedify-image.pkr.hcl
#   packer build speedify-image.pkr.hcl

packer {
  required_plugins {
    azure = {
      version = ">= 1.1.1"
      source  = "github.com/hashicorp/azure"
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

variable "image_resource_group" {
  description = "Existing resource group that receives the built managed image"
  type        = string
  default     = "speedify2"
}

variable "build_vm_size" {
  description = "Size of the temporary VM used during the image build"
  type        = string
  default     = "Standard_B1ms"
}


source "azure-arm" "speedify" {
  use_azure_cli_auth = true
  client_id       = "87aa3687-66a4-4fab-bf59-70de6bf768fa"
  tenant_id       = "15fb0613-7977-4551-801b-6aadac824241"
  subscription_id = var.subscription_id

  location = var.location
  vm_size  = var.build_vm_size
  os_type  = "Linux"

  image_publisher = "Zenblox"
  image_offer     = "Speedify"
  image_sku       = "server"
  image_version   = "{{timestamp}}"

  managed_image_resource_group_name = var.image_resource_group
  managed_image_name                = "speedify-{{timestamp}}"

  azure_tags = {
    purpose = "speedify-server-golden-image"
    builtBy = "packer"
  }

  # DESTINATION: This sends the output directly to your Azure Compute Gallery
  # shared_image_gallery_destination {
  #   subscription        = var.subscription_id
  #   resource_group      = var.gallery_rg
  #   gallery_name        = var.gallery_name
  #   image_name          = var.image_name
  #   image_version       = var.image_version
  #   replication_regions = ["East US"]
  # }
}

build {
  sources = ["source.azure-arm.speedify"]

  # Provisioners intentionally omitted while the build pipeline is tested.
  # When provisioning is re-enabled, add a shell provisioner here (inline
  # commands or a .sh script) and end it with the waagent deprovision:
  #   /usr/sbin/waagent -force -deprovision+user && export HISTSIZE=0 && sync
}