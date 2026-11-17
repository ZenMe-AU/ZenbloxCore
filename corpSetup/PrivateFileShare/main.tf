resource "azurerm_resource_group" "private_file_share" {
  name     = var.PRIV_SHARE
  location = var.location
}

resource "azurerm_storage_account" "private_file_share" {
  name                          = "privatefilesharestor"
  resource_group_name           = azurerm_resource_group.private_file_share.name
  location                      = azurerm_resource_group.private_file_share.location
  account_tier                  = "Standard"
  account_replication_type      = "LRS"
  public_network_access_enabled = true

  network_rules {
    default_action             = "Deny"
    bypass                     = []
    virtual_network_subnet_ids = [azurerm_subnet.service_access.id]
  }
}

resource "azurerm_virtual_network" "private_file_share" {
  name                = "privatefileshare-vnet"
  location            = azurerm_resource_group.private_file_share.location
  resource_group_name = azurerm_resource_group.private_file_share.name
  address_space       = [var.VIRTUAL_NETWORK_ADDRESS_SPACE]
}

resource "azurerm_subnet" "service_access" {
  name                            = "service-access"
  resource_group_name             = azurerm_resource_group.private_file_share.name
  virtual_network_name            = azurerm_virtual_network.private_file_share.name
  address_prefixes                = [var.SERVICE_ACCESS_SUBNET_ADDRESS_PREFIX]
  default_outbound_access_enabled = false
  service_endpoints               = ["Microsoft.Storage"]
}

resource "azurerm_network_security_group" "service_access" {
  name                = "privatefileshare-service-access-nsg"
  location            = azurerm_resource_group.private_file_share.location
  resource_group_name = azurerm_resource_group.private_file_share.name

  security_rule {
    name                       = "DenyAllInbound"
    priority                   = 4096
    direction                  = "Inbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "*"
    destination_address_prefix = "*"
  }
}

resource "azurerm_subnet_network_security_group_association" "service_access" {
  subnet_id                 = azurerm_subnet.service_access.id
  network_security_group_id = azurerm_network_security_group.service_access.id
}