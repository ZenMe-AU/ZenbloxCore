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

variable "image_resource_group" {
  description = "Existing resource group that receives the built managed image"
  type        = string
  default     = "privavd"
}

variable "build_vm_size" {
  description = "Size of the temporary VM used during the image build"
  type        = string
  default     = "Standard_D4s_v5"
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
source "azure-arm" "paw" {
  use_azure_cli_auth = true
  client_id       = "87aa3687-66a4-4fab-bf59-70de6bf768fa"
  tenant_id       = "15fb0613-7977-4551-801b-6aadac824241"
  subscription_id = var.subscription_id

  location = var.location
  vm_size  = var.build_vm_size
  os_type  = "Windows"

  image_publisher = "MicrosoftWindowsDesktop"
  image_offer     = "windows-11"
  image_sku       = "win11-24h2-avd"
  image_version   = "latest"

  managed_image_resource_group_name = var.image_resource_group
  managed_image_name                = "paw-golden-{{timestamp}}"

  communicator   = "winrm"
  winrm_use_ssl  = true
  winrm_insecure = true
  winrm_timeout  = "15m"
  winrm_username = "packer"

  azure_tags = {
    purpose = "paw-golden-image"
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
  sources = ["source.azure-arm.paw"]

  # Baseline PAW hardening: reduce attack surface before applying updates.
  provisioner "powershell" {
    inline = [
      "Disable-WindowsOptionalFeature -Online -FeatureName SMB1Protocol -NoRestart",
      "Set-SmbServerConfiguration -EnableSMB1Protocol $false -Force",
      "Set-ItemProperty -Path 'HKLM:\\SYSTEM\\CurrentControlSet\\Services\\LanmanWorkstation' -Name AllowInsecureGuestAuth -Value 0",
      "Set-ItemProperty -Path 'HKLM:\\Software\\Policies\\Microsoft\\Windows NT\\DNSClient' -Name EnableMulticast -Value 0",
      "Set-MpPreference -DisableRealtimeMonitoring $false -MAPSReporting Advanced -SubmitSamplesConsent SendAllSamples",
      "Set-MpPreference -PUAProtection Enabled",
      "Set-MpPreference -AttackSurfaceReductionRules_Ids D4F940AB-401B-4EFC-AADC-AD5F3C50688A -AttackSurfaceReductionRules_Actions Enabled"
    ]
  }

  provisioner "windows-update" {
    search_criteria = "IsInstalled=0"
    filters = [
      "exclude:$_.Title -like '*Preview*'",
      "include:$true"
    ]
  }

  provisioner "windows-restart" {
    restart_timeout = "15m"
  }

  # Generalize before capture.
  provisioner "powershell" {
    inline = [
      "while ((Get-Service RdAgent -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Sleep -s 5 }",
      "while ((Get-Service WindowsAzureGuestAgent -ErrorAction SilentlyContinue).Status -ne 'Running') { Start-Sleep -s 5 }",
      "& $env:SystemRoot\\System32\\Sysprep\\Sysprep.exe /oobe /generalize /quiet /quit /mode:vm",
      "while ($true) { $imageState = (Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Setup\\State).ImageState; if ($imageState -eq 'IMAGE_STATE_GENERALIZE_RESEAL_TO_OOBE') { break }; Start-Sleep -s 5 }"
    ]
  }
}
