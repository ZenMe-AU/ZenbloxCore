# Packer template that builds the Speedify server base image and publishes it
# to the Azure Compute Gallery.
#
# The gallery naming below (gallery_rg / gallery_name / image_name /
# image_version) is the single source of truth: build.ps1 parses these
# defaults, creates the gallery + image definition if missing, deletes the
# existing version, then runs this HCL build - so every run refreshes the same
# gallery entry instead of failing or creating timestamped duplicates.
#
# Provisioning bakes the full Speedify server stack into the image:
#   1. install-speedify-server.sh installs Docker + docker compose v2
#   2. docker-compose.yml + a default .env are written to /opt/speedify-server
#   3. The speedify/ss-manager image is pulled so the VM needs no pulls at boot
#   4. waagent deprovision generalizes the image for reuse
#
# The image is IP-agnostic: docker-compose.yml keeps ${public_ip} and
# ${server_name} as compose interpolation variables resolved from .env at
# runtime. Terraform's cloud-init stamps each VM's real public IP (from Azure
# IMDS) into .env, then runs `docker compose up -d` - ZERO runtime installs.
#
# This is the HCL twin of speedify.json (the doc-style JSON template).
# Build only one template at a time - `packer build .` would run both.
#
# Build (normally via .\build.ps1, or manually from this directory):
#   packer init .
#   packer validate -var "image_version=1.0.0" speedify-image.pkr.hcl
#   packer build -var "image_version=1.0.0" speedify-image.pkr.hcl

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

variable "gallery_rg" {
  description = "Resource group that contains the Azure Compute Gallery"
  type        = string
  default     = "speedify2"
}

variable "gallery_name" {
  description = "Azure Compute Gallery that receives the image version"
  type        = string
  default     = "zenblox"
}

variable "image_name" {
  description = "Gallery image definition name (stable handle, never changes)"
  type        = string
  default     = "speedify"
}

variable "image_version" {
  description = "Gallery image version (semver). build.ps1 deletes the existing version first so the same version can be rebuilt"
  type        = string
  default     = "1.0.0"
}

variable "server_name" {
  description = "Default server name baked into the image .env (cloud-init overrides per VM)"
  type        = string
  default     = "Speedify Self-Hosted Server"
}


source "azure-arm" "speedify" {
  use_azure_cli_auth = true
  client_id       = "87aa3687-66a4-4fab-bf59-70de6bf768fa"
  tenant_id       = "15fb0613-7977-4551-801b-6aadac824241"
  subscription_id = var.subscription_id

  location = var.location
  vm_size  = var.build_vm_size
  os_type  = "Linux"

  # Base image: plain Ubuntu 24.04 from the marketplace (matches the
  # source_image_reference in speedify.tf). "Zenblox/Speedify" is NOT a
  # marketplace publisher - it is the gallery naming we publish TO below.
  image_publisher = "Canonical"
  image_offer     = "ubuntu-24_04-lts"
  image_sku       = "server"
  image_version   = "latest"

  # Intermediate managed image. Packer requires a managed image target when
  # publishing to a gallery; the script deletes the previous one before each
  # run so the name stays constant (no timestamps). Named the same as the
  # gallery image definition for consistency.
  managed_image_resource_group_name = var.image_resource_group
  managed_image_name                = "speedify"

  azure_tags = {
    purpose = "speedify-server-image"
    builtBy = "packer"
  }

  # DESTINATION: publish the build straight into the Azure Compute Gallery
  # under the stable name zenblox/speedify. build.ps1 deletes any existing
  # version before the build so re-runs overwrite instead of failing.
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
  sources = ["source.azure-arm.speedify"]

  # 1. Install Docker + docker compose v2 (from install-speedify-server.sh).
  #    The script is idempotent - it skips installs that are already present.
  provisioner "shell" {
    script          = "${path.root}/install-speedify-server.sh"
    execute_command = "chmod +x '{{ .Path }}'; {{ .Vars }} sudo -E bash '{{ .Path }}'"
  }

  # 2. Bake the docker-compose.yml and a default .env, then pull the
  #    ss-manager image so the VM needs no network pulls at boot.
  #    The compose file keeps ${public_ip}/${server_name} as compose
  #    interpolation variables (resolved from .env at runtime) so the image
  #    stays IP-agnostic - each VM stamps its own IP via cloud-init.
  provisioner "shell" {
    execute_command = "chmod +x '{{ .Path }}'; {{ .Vars }} sudo -E bash '{{ .Path }}'"
    inline = [
      "set -eu",
      "install -d -m 0750 /opt/speedify-server/.local/ssm",
      "cat > /opt/speedify-server/docker-compose.yml <<'COMPOSE_EOF'",
      file("${path.root}/docker-compose.yml"),
      "COMPOSE_EOF",
      "cat > /opt/speedify-server/.env <<'ENV_EOF'",
      "PUBLIC_IP=auto",
      "SERVER_NAME=${var.server_name}",
      "ENV_EOF",
      "cd /opt/speedify-server",
      "docker compose pull",
      "echo 'Speedify server stack pre-baked into image.'",
    ]
  }

  # 3. Generalize the image (required before capture).
  provisioner "shell" {
    execute_command = "chmod +x '{{ .Path }}'; {{ .Vars }} sudo -E bash '{{ .Path }}'"
    inline = [
      "/usr/sbin/waagent -force -deprovision+user && export HISTSIZE=0 && sync",
    ]
  }
}