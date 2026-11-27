resource "random_password" "local_administrator" {
  length           = 32
  special          = true
  override_special = "!#%+,-.:=?@_"
}

# Egress for Entra join, Windows Update, and KMS activation rides a
# dedicated static public IP: the subnet has default outbound access
# disabled, so without this the NSG service-tag allow-list has no SNAT
# path and public Microsoft endpoints time out. Inbound stays blocked
# by the NSG DenyAllInbound rule.
resource "azurerm_public_ip" "session_host" {
  count               = var.SESSION_HOST_COUNT
  name                = "${var.HOST_POOL_NAME}-pip-${count.index + 1}"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = var.TAGS
}

resource "azurerm_network_interface" "session_host" {
  count               = var.SESSION_HOST_COUNT
  name                = "${var.HOST_POOL_NAME}-nic-${count.index + 1}"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  tags                = var.TAGS

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.session_hosts.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.session_host[count.index].id
  }
}

resource "azurerm_windows_virtual_machine" "session_host" {
  count                 = var.SESSION_HOST_COUNT
  name                  = "${var.HOST_POOL_NAME}-${count.index + 1}"
  computer_name         = "${var.HOST_POOL_NAME}-${count.index + 1}"
  location              = azurerm_resource_group.avd.location
  resource_group_name   = azurerm_resource_group.avd.name
  size                  = var.VM_SIZE
  admin_username        = var.ADMINISTRATOR_USERNAME
  admin_password        = random_password.local_administrator.result
  network_interface_ids = [azurerm_network_interface.session_host[count.index].id]
  license_type          = "Windows_Client"
  secure_boot_enabled   = true
  vtpm_enabled          = true
  tags                  = var.TAGS

  source_image_id = data.azurerm_shared_image_version.paw.id

  os_disk {
    name                 = "${var.HOST_POOL_NAME}-${count.index + 1}-os"
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_virtual_machine_extension" "entra_login" {
  count                      = var.SESSION_HOST_COUNT
  name                       = "AADLoginForWindows"
  virtual_machine_id         = azurerm_windows_virtual_machine.session_host[count.index].id
  publisher                  = "Microsoft.Azure.ActiveDirectory"
  type                       = "AADLoginForWindows"
  type_handler_version       = "2.2"
  auto_upgrade_minor_version = true
}

resource "azurerm_virtual_machine_extension" "avd_register" {
  count                      = var.SESSION_HOST_COUNT
  name                       = "avd-registration"
  virtual_machine_id         = azurerm_windows_virtual_machine.session_host[count.index].id
  publisher                  = "Microsoft.Compute"
  type                       = "CustomScriptExtension"
  type_handler_version       = "1.10"
  auto_upgrade_minor_version = true

  protected_settings = jsonencode({
    commandToExecute = "powershell.exe -NoLogo -NoProfile -NonInteractive -ExecutionPolicy Bypass -File C:\\ProgramData\\PAW\\AvdRegistration\\register-avd-session-host.ps1 -RegistrationTokenBase64 ${base64encode(azurerm_virtual_desktop_host_pool_registration_info.pooled.token)}"
  })

  depends_on = [
    azurerm_virtual_machine_extension.entra_login,
    # azurerm_firewall_policy_rule_collection_group.avd_egress,
    # azurerm_subnet_route_table_association.session_hosts
  ]
}

# Artifact Keeper trust (optional): marks the AK private blob host as a Local
# Intranet site, machine-wide, so unattended winget installs from it are not
# held by the Internet-zone security prompt. See
# scripts/Set-ArtifactKeeperTrust.ps1 and ZbArtifactKeeper
# docs/PAW-INTEGRATION.md.
resource "azurerm_virtual_machine_run_command" "artifact_keeper_trust" {
  count              = var.ARTIFACT_KEEPER_BLOB_HOST == "" ? 0 : var.SESSION_HOST_COUNT
  name               = "artifact-keeper-trust"
  location           = azurerm_resource_group.avd.location
  virtual_machine_id = azurerm_windows_virtual_machine.session_host[count.index].id

  source {
    script = file("${path.module}/scripts/Set-ArtifactKeeperTrust.ps1")
  }

  parameter {
    name  = "BlobHost"
    value = var.ARTIFACT_KEEPER_BLOB_HOST
  }

  depends_on = [azurerm_virtual_machine_extension.avd_register]
}

# Artifact Keeper read-only file share (optional): cloud Kerberos ticket
# retrieval, so users map the share with their Entra account (no password
# prompt), plus Local Intranet trust for the share's file host. Separate from
# the blob trust above so stacks without the share see no change. See
# scripts/Enable-ArtifactKeeperFileShare.ps1 and ZbArtifactKeeper
# docs/PAW-INTEGRATION.md. The Kerberos setting applies after a restart.
resource "azurerm_virtual_machine_run_command" "artifact_keeper_file_share" {
  count              = var.ARTIFACT_KEEPER_BLOB_HOST != "" && var.ARTIFACT_KEEPER_FILE_SHARE ? var.SESSION_HOST_COUNT : 0
  name               = "artifact-keeper-file-share"
  location           = azurerm_resource_group.avd.location
  virtual_machine_id = azurerm_windows_virtual_machine.session_host[count.index].id

  source {
    script = file("${path.module}/scripts/Enable-ArtifactKeeperFileShare.ps1")
  }

  parameter {
    name  = "FileHost"
    value = replace(var.ARTIFACT_KEEPER_BLOB_HOST, ".blob.core.windows.net", ".file.core.windows.net")
  }

  # One run command at a time per VM.
  depends_on = [azurerm_virtual_machine_run_command.artifact_keeper_trust]
}

# Clipboard direction (CLIPBOARD_MODE) and phone/camera (MTP/PTP) blocking are
# session-host policies: the host pool RDP properties (avd.tf) only switch
# redirection on or off. See scripts/Set-PawRedirectionPolicy.ps1. Takes
# effect after the session host's next restart.
resource "azurerm_virtual_machine_run_command" "redirection_policy" {
  count              = var.SESSION_HOST_COUNT
  name               = "paw-redirection-policy"
  location           = azurerm_resource_group.avd.location
  virtual_machine_id = azurerm_windows_virtual_machine.session_host[count.index].id

  source {
    script = file("${path.module}/scripts/Set-PawRedirectionPolicy.ps1")
  }

  parameter {
    name  = "ClipboardMode"
    value = var.CLIPBOARD_MODE
  }

  # One run command at a time per VM.
  depends_on = [
    azurerm_virtual_machine_extension.avd_register,
    azurerm_virtual_machine_run_command.artifact_keeper_trust,
    azurerm_virtual_machine_run_command.artifact_keeper_file_share,
  ]
}

# Sign-in tasks (optional, with the Artifact Keeper file share): at every user
# sign-in, map the share (ARTIFACT_KEEPER_DRIVE_LETTER) and install the
# developer tools listed in Installers/paw-user-tools.json on the share for
# that user, without admin rights (PAW_USER_TOOLS). See
# scripts/Install-PawSignIn.ps1 and scripts/paw-signin/. The two user scripts
# travel inside the run command as base64 text, defined above the installer.
resource "azurerm_virtual_machine_run_command" "paw_signin" {
  count              = var.ARTIFACT_KEEPER_BLOB_HOST != "" && var.ARTIFACT_KEEPER_FILE_SHARE ? var.SESSION_HOST_COUNT : 0
  name               = "paw-signin"
  location           = azurerm_resource_group.avd.location
  virtual_machine_id = azurerm_windows_virtual_machine.session_host[count.index].id

  source {
    script = join("\n", [
      "$ZbShareRoot = '\\\\${replace(var.ARTIFACT_KEEPER_BLOB_HOST, ".blob.core.windows.net", ".file.core.windows.net")}\\${var.ARTIFACT_KEEPER_FILE_SHARE_NAME}'",
      "$ZbDriveLetter = '${var.ARTIFACT_KEEPER_DRIVE_LETTER}'",
      "$ZbUserTools = '${var.PAW_USER_TOOLS}'",
      "$ZbFiles = @{ 'Invoke-PawSignIn.ps1' = '${filebase64("${path.module}/scripts/paw-signin/Invoke-PawSignIn.ps1")}'; 'Install-PawUserTools.ps1' = '${filebase64("${path.module}/scripts/paw-signin/Install-PawUserTools.ps1")}' }",
      file("${path.module}/scripts/Install-PawSignIn.ps1"),
    ])
  }

  # One run command at a time per VM.
  depends_on = [azurerm_virtual_machine_run_command.redirection_policy]
}
