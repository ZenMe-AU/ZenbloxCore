resource "random_password" "local_administrator" {
  length           = 32
  special          = true
  override_special = "!#%+,-.:=?@_"
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
  }
}

resource "azurerm_windows_virtual_machine" "session_host" {
  count                 = var.SESSION_HOST_COUNT
  name                  = "${var.HOST_POOL_NAME}-${count.index + 1}"
  computer_name         = "paw-avd-${count.index + 1}"
  location              = azurerm_resource_group.avd.location
  resource_group_name   = azurerm_resource_group.avd.name
  size                  = var.VM_SIZE
  admin_username        = var.ADMINISTRATOR_USERNAME
  admin_password        = random_password.local_administrator.result
  network_interface_ids = [azurerm_network_interface.session_host[count.index].id]
  license_type          = "Windows_Client"
  secure_boot_enabled   = false
  vtpm_enabled          = false
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
  publisher                  = "Microsoft.Powershell"
  type                       = "DSC"
  type_handler_version       = "2.73"
  auto_upgrade_minor_version = true

  settings = jsonencode({
    modulesUrl            = var.REGISTRATION_DSC_MODULES_URL
    configurationFunction = "Configuration.ps1\\AddSessionHost"
    properties = [
      {
        name  = "hostPoolName"
        value = var.HOST_POOL_NAME
        type  = "String"
      },
      {
        name  = "registrationInfoToken"
        value = azurerm_virtual_desktop_host_pool_registration_info.pooled.token
        type  = "String"
      },
      {
        name  = "aadJoin"
        value = true
        type  = "Boolean"
      },
      {
        name  = "UseAgentDownloadEndpoint"
        value = true
        type  = "Boolean"
      }
    ]
  })

  depends_on = [
    azurerm_virtual_machine_extension.entra_login,
    azurerm_firewall_policy_rule_collection_group.avd_egress,
    azurerm_subnet_route_table_association.session_hosts
  ]
}