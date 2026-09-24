resource "random_password" "local_administrator" {
  length           = 32
  special          = true
  override_special = "!#%+,-.:=?@_"
}

resource "azurerm_network_interface" "session_host" {
  count               = var.session_host_count
  name                = "${var.host_pool_name}-nic-${count.index + 1}"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  tags                = var.tags

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.session_hosts.id
    private_ip_address_allocation = "Dynamic"
  }
}

resource "azurerm_windows_virtual_machine" "session_host" {
  count                 = var.session_host_count
  name                  = "${var.host_pool_name}-${count.index + 1}"
  location              = azurerm_resource_group.avd.location
  resource_group_name   = azurerm_resource_group.avd.name
  size                  = var.vm_size
  admin_username        = var.administrator_username
  admin_password        = random_password.local_administrator.result
  network_interface_ids = [azurerm_network_interface.session_host[count.index].id]
  license_type          = "Windows_Client"
  secure_boot_enabled   = true
  vtpm_enabled          = true
  tags                  = var.tags

  source_image_id = data.azurerm_shared_image_version.paw.id

  os_disk {
    name                 = "${var.host_pool_name}-${count.index + 1}-os"
    caching              = "ReadWrite"
    storage_account_type = "StandardSSD_LRS"
  }

  identity {
    type = "SystemAssigned"
  }
}

resource "azurerm_virtual_machine_extension" "entra_login" {
  count                      = var.session_host_count
  name                       = "AADLoginForWindows"
  virtual_machine_id         = azurerm_windows_virtual_machine.session_host[count.index].id
  publisher                  = "Microsoft.Azure.ActiveDirectory"
  type                       = "AADLoginForWindows"
  type_handler_version       = "2.2"
  auto_upgrade_minor_version = true
}

resource "azurerm_virtual_machine_extension" "avd_register" {
  count                      = var.session_host_count
  name                       = "avd-registration"
  virtual_machine_id         = azurerm_windows_virtual_machine.session_host[count.index].id
  publisher                  = "Microsoft.Powershell"
  type                       = "DSC"
  type_handler_version       = "2.73"
  auto_upgrade_minor_version = true

  settings = jsonencode({
    modulesUrl            = var.registration_dsc_modules_url
    configurationFunction = "Configuration.ps1\\AddSessionHost"
    properties = [
      {
        name  = "hostPoolName"
        value = var.host_pool_name
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