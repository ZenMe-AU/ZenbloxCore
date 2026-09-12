output "new_subscription_id" {
  value = var.subscription_id
}

resource "azurerm_resource_group" "speedify_rg" {
  name     = "speedify2"
  location = "eastus"
}

resource "azurerm_virtual_network" "speedify" {
  name                = "speedify-vnet"
  address_space       = ["10.0.0.0/16"]
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name
}

resource "azurerm_subnet" "speedify" {
  name                 = "speedify-subnet"
  resource_group_name  = azurerm_resource_group.speedify_rg.name
  virtual_network_name = azurerm_virtual_network.speedify.name
  address_prefixes     = ["10.0.1.0/24"]
}

resource "azurerm_public_ip" "speedify" {
  name                = "speedify-public-ip"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name
  allocation_method   = "Static"
  sku                 = "Standard"
}

resource "azurerm_network_security_group" "speedify" {
  name                = "speedify-nsg"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name

  security_rule {
    name                       = "speedify-api"
    priority                   = 100
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "8443"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "speedify-session-tcp"
    priority                   = 110
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "32768-65535"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }

  security_rule {
    name                       = "speedify-session-udp"
    priority                   = 120
    direction                  = "Inbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "32768-65535"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_network_interface" "speedify" {
  name                = "speedify-vm-nic"
  location            = azurerm_resource_group.speedify_rg.location
  resource_group_name = azurerm_resource_group.speedify_rg.name

  ip_configuration {
    name                          = "internal"
    subnet_id                     = azurerm_subnet.speedify.id
    private_ip_address_allocation = "Dynamic"
    public_ip_address_id          = azurerm_public_ip.speedify.id
  }

}

resource "azurerm_network_interface_security_group_association" "speedify" {
  network_interface_id      = azurerm_network_interface.speedify.id
  network_security_group_id = azurerm_network_security_group.speedify.id
}

resource "azurerm_linux_virtual_machine" "speedify" {
  name                = "speedifyVM"
  resource_group_name = azurerm_resource_group.speedify_rg.name
  location            = azurerm_resource_group.speedify_rg.location
  size                = "Standard_B1ms"
  admin_username      = "azureuser"
  network_interface_ids = [
    azurerm_network_interface.speedify.id,
  ]

  disable_password_authentication = false
  admin_password                  = var.admin_password

  os_disk {
    caching              = "ReadWrite"
    storage_account_type = "Standard_LRS"
  }

  source_image_reference {
    publisher = "Canonical"
    offer     = "ubuntu-24_04-lts"
    sku       = "server"
    version   = "latest"
  }
}

resource "azurerm_virtual_machine_extension" "speedify_server" {
  name                 = "speedify-server-install"
  virtual_machine_id   = azurerm_linux_virtual_machine.speedify.id
  publisher            = "Microsoft.Azure.Extensions"
  type                 = "CustomScript"
  type_handler_version = "2.1"

  protected_settings = jsonencode({
    script = base64encode(file("${path.module}/install-speedify-server.sh"))
  })
}

output "speedify_public_ip" {
  description = "Public IP used by Speedify clients"
  value       = azurerm_public_ip.speedify.ip_address
}

