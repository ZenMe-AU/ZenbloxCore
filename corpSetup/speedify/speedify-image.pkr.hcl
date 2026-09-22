# Packer template that builds the Speedify server base image and publishes it
# to the Azure Compute Gallery.
#
# CONFIG: all values come from corp.env (../corp.env) - the single source of
# truth for the whole corp. build.ps1 reads corp.env, verifies the values
# against the active `az login` session, and passes them in as -var flags.
# Every variable below is REQUIRED (no defaults) - a missing corp.env key
# fails the build immediately instead of silently using a stale value.
#
# Provisioning bakes the full Speedify server stack into the image:
#   1. docker-compose.yml is uploaded to /tmp (repo source of truth)
#   2. install-speedify-server.sh installs Docker + docker compose v2,
#      bakes /opt/speedify-server (docker-compose.yml + default .env) and
#      pre-pulls the speedify/ss-manager image
#   3. waagent deprovision generalizes the image for reuse
#
# The image is IP-agnostic: docker-compose.yml keeps ${PUBLIC_IP} and
# ${SERVER_NAME} as compose interpolation variables resolved from .env at
# runtime. Terraform's cloud-init stamps each VM's real public IP (from Azure
# IMDS) into .env, then runs `docker compose up -d` - ZERO runtime installs.
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
  description = "Azure subscription used for the image build (corp.env: SUBSCRIPTION_ID)"
  type        = string
}

variable "location" {
  description = "Azure region where the build VM and image are created (corp.env: SPEEDIFY_LOCATION)"
  type        = string
}

variable "resource_group" {
  description = "Resource group that receives the managed image, hosts the gallery and later the VM (corp.env: SPEEDIFY_RESOURCE_GROUP)"
  type        = string
}

variable "gallery_name" {
  description = "Azure Compute Gallery that receives the image version (corp.env: SPEEDIFY_GALLERY_NAME)"
  type        = string
}

variable "image_name" {
  description = "Gallery image definition name (stable handle, never changes) (corp.env: SPEEDIFY_IMAGE_NAME)"
  type        = string
}

variable "image_version" {
  description = "Gallery image version (semver). build.ps1 deletes the existing version first so the same version can be rebuilt (corp.env: SPEEDIFY_IMAGE_VERSION)"
  type        = string
}

variable "build_vm_size" {
  description = "Size of the temporary VM used during the image build (corp.env: SPEEDIFY_BUILD_VM_SIZE)"
  type        = string
}

variable "server_name" {
  description = "Default server name written into the image .env; cloud-init overrides per VM (corp.env: SPEEDIFY_SERVER_NAME)"
  type        = string
}


source "azure-arm" "speedify" {
  # Auth: uses the active `az login` session (build.ps1 logs in first).
  # client_id/tenant_id are unnecessary here - CLI auth ignores them.
  # subscription_id is kept to pin the build to the intended subscription.
  use_azure_cli_auth = true
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
  managed_image_resource_group_name = var.resource_group
  managed_image_name                = var.image_name

  azure_tags = {
    purpose = "speedify-server-image"
    builtBy = "packer"
  }

  # DESTINATION: publish the build straight into the Azure Compute Gallery
  # under the stable name zenblox/speedify. build.ps1 deletes any existing
  # version before the build so re-runs overwrite instead of failing.
  shared_image_gallery_destination {
    subscription        = var.subscription_id
    resource_group      = var.resource_group
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

  # Upload docker-compose.yml (repo source of truth) to /tmp for the script.
  provisioner "file" {
    source      = "${path.root}/docker-compose.yml"
    destination = "/tmp/docker-compose.yml"
  }

  # Single install command: install-speedify-server.sh does everything -
  # installs Docker + compose v2, bakes /opt/speedify-server (copies the
  # uploaded docker-compose.yml + writes default .env) and pre-pulls the
  # ss-manager image. Idempotent, so re-running the build is safe.
  # SERVER_NAME (from corp.env) is passed in as an env var; {{ .Vars }} in
  # execute_command injects it into the sudo environment.
  provisioner "shell" {
    environment_vars = [
      "SERVER_NAME=${var.server_name}",
    ]
    script          = "${path.root}/install-speedify-server.sh"
    execute_command = "chmod +x '{{ .Path }}'; {{ .Vars }} sudo -E bash '{{ .Path }}'"
  }

  # Generalize the image (required before capture).
  provisioner "shell" {
    execute_command = "chmod +x '{{ .Path }}'; {{ .Vars }} sudo -E bash '{{ .Path }}'"
    inline = [
      "/usr/sbin/waagent -force -deprovision+user && export HISTSIZE=0 && sync",
    ]
  }
}