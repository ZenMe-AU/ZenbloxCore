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
  client_id       = "87aa3687-66a4-4fab-bf59-70de6bf768fa"
  client_secret   = ""
  "use_azure_cli_auth": true
  tenant_id       = "15fb0613-7977-4551-801b-6aadac824241"
  subscription_id = var.subscription_id

  location = var.location
  vm_size  = var.build_vm_size
  os_type  = "Linux"

  image_publisher = "Canonical"
  image_offer     = "ubuntu-24_04-lts"
  image_sku       = "server"
  image_version   = "latest"

  managed_image_resource_group_name = var.image_resource_group
  managed_image_name                = "speedify-golden-{{timestamp}}"

  azure_tags = {
    purpose = "speedify-server-golden-image"
    builtBy = "packer"
  }
}

build {
  sources = ["source.azure-arm.speedify"]

  # Provisioners intentionally omitted while the build pipeline is tested.
  # When provisioning is re-enabled, add a shell provisioner here (inline
  # commands or a .sh script) and end it with the waagent deprovision:
  #   /usr/sbin/waagent -force -deprovision+user && export HISTSIZE=0 && sync
}