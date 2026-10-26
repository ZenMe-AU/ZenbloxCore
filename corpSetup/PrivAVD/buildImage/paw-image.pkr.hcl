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

  # Trusted Launch: the build VM must be a Gen2 Trusted Launch VM so the
  # captured image is TL-capable; session hosts then boot with Secure Boot
  # and vTPM enforced (session_hosts.tf). Secure Boot/vTPM flags are only
  # accepted when publishing directly to a Shared Image Gallery.
  security_type       = "TrustedLaunch"
  secure_boot_enabled = true
  vtpm_enabled        = true

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

  provisioner "file" {
    source      = "register-avd-session-host.ps1"
    destination = "C:\\Windows\\Temp\\register-avd-session-host.ps1"
  }

  provisioner "powershell" {
    script = "img-stage-avd-registration.ps1"
  }

  provisioner "powershell" {
    script = "img-harden-paw.ps1"
  }

  provisioner "windows-update" {
    search_criteria = "IsInstalled=0"
    filters = [
      "exclude:$_.Title -like '*Preview*'",
      # NB KB5007651 (Windows Security platform) can only be applied while a
      #    user is logged in, so it never completes in a Packer WinRM session
      #    and would loop the provisioner forever (documented upstream).
      "exclude:$_.Title -like '*KB5007651*'",
      "include:$true"
    ]
  }

  provisioner "windows-restart" {
    restart_timeout = "15m"
  }

  # Upload the offline package set from the BUILD HOST (the machine running
  # packer - Erv-pc) to the build VM. SINGLE ARCHIVE, not a directory walk:
  # WinRM uploads are chunked into hundreds of small commands with no
  # progress output, so walking 100+ files is slow and fragile; one ~70 MB
  # zip uploaded to the existing C:/Windows/Temp is one sequential stream.
  # Regenerate the zip with make-packages-zip.ps1 after changing the package
  # folder. The "Uploading ..." line is SILENT for several minutes - that
  # is expected; do not cancel the build during it.
  # Absolute local source path for now; the permanent home should be the
  # repo or a network share.
  provisioner "file" {
    source      = "C:/zenme/dependencies/wingetrepo-packages.zip"
    destination = "C:/Windows/Temp/packages.zip"
  }

  # Winget-Repo: installs the private winget repository into the image as a
  # localhost-only service (Task Scheduler, AtStartup, SYSTEM, ssl=true).
  # Installs from the uploaded package set in C:\packages - NO internet used
  # by this provisioner. Every deployed PAW gets Python 3.12 + Winget-Repo
  # V2.9.2 + a 10-year localhost TLS cert + a winget source pointing at the
  # local repo. Default winget/msstore sources are removed. The service is
  # stopped at the end of this provisioner (before sysprep) and re-starts on
  # first boot.
  provisioner "powershell" {
    script = "img-install-wingetrepo.ps1"
  }

  # Restart after the Winget-Repo install: the Python installer and pip can
  # set pending-reboot flags (VC++ redistributables, service registrations)
  # that silently hang sysprep if not cleared. This restart clears them,
  # and the AtStartup trigger fires the WingetRepo service so the generalize
  # script can verify it starts correctly before stopping it for sysprep.
  provisioner "windows-restart" {
    restart_timeout = "15m"
  }

  provisioner "powershell" {
    script = "img-generalize.ps1"
  }
}