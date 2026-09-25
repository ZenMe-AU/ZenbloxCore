locals {
  firewall_private_ip = azurerm_firewall.avd.ip_configuration[0].private_ip_address
}

resource "azurerm_virtual_network" "avd" {
  name                = "${var.HOST_POOL_NAME}-vnet"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  address_space       = [var.VIRTUAL_NETWORK_ADDRESS_SPACE]
  tags                = var.TAGS
}

resource "azurerm_subnet" "firewall" {
  name                 = "AzureFirewallSubnet"
  resource_group_name  = azurerm_resource_group.avd.name
  virtual_network_name = azurerm_virtual_network.avd.name
  address_prefixes     = [var.FIREWALL_SUBNET_ADDRESS_PREFIX]
}

resource "azurerm_subnet" "session_hosts" {
  name                            = "session-hosts"
  resource_group_name             = azurerm_resource_group.avd.name
  virtual_network_name            = azurerm_virtual_network.avd.name
  address_prefixes                = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
  default_outbound_access_enabled = false
}

resource "azurerm_network_security_group" "session_hosts" {
  name                = "${var.HOST_POOL_NAME}-session-hosts-nsg"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  tags                = var.TAGS

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

  security_rule {
    name                       = "AllowFirewallDnsUdp"
    priority                   = 100
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Udp"
    source_port_range          = "*"
    destination_port_range     = "53"
    source_address_prefix      = var.SESSION_HOST_SUBNET_ADDRESS_PREFIX
    destination_address_prefix = var.FIREWALL_SUBNET_ADDRESS_PREFIX
  }

  security_rule {
    name                       = "AllowFirewallDnsTcp"
    priority                   = 110
    direction                  = "Outbound"
    access                     = "Allow"
    protocol                   = "Tcp"
    source_port_range          = "*"
    destination_port_range     = "53"
    source_address_prefix      = var.SESSION_HOST_SUBNET_ADDRESS_PREFIX
    destination_address_prefix = var.FIREWALL_SUBNET_ADDRESS_PREFIX
  }

  security_rule {
    name                       = "DenyPrivateNetworkOutbound"
    priority                   = 4000
    direction                  = "Outbound"
    access                     = "Deny"
    protocol                   = "*"
    source_port_range          = "*"
    destination_port_range     = "*"
    source_address_prefix      = "VirtualNetwork"
    destination_address_prefix = "VirtualNetwork"
  }
}

resource "azurerm_subnet_network_security_group_association" "session_hosts" {
  subnet_id                 = azurerm_subnet.session_hosts.id
  network_security_group_id = azurerm_network_security_group.session_hosts.id
}

resource "azurerm_public_ip" "firewall" {
  name                = "${var.HOST_POOL_NAME}-firewall-pip"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = var.TAGS
}

resource "azurerm_firewall_policy" "avd" {
  name                     = "${var.HOST_POOL_NAME}-firewall-policy"
  location                 = azurerm_resource_group.avd.location
  resource_group_name      = azurerm_resource_group.avd.name
  sku                      = "Standard"
  threat_intelligence_mode = "Deny"
  tags                     = var.TAGS

  dns {
    proxy_enabled = true
  }
}

resource "azurerm_firewall" "avd" {
  name                = "${var.HOST_POOL_NAME}-firewall"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  sku_name            = "AZFW_VNet"
  sku_tier            = "Standard"
  firewall_policy_id  = azurerm_firewall_policy.avd.id
  tags                = var.TAGS

  ip_configuration {
    name                 = "configuration"
    subnet_id            = azurerm_subnet.firewall.id
    public_ip_address_id = azurerm_public_ip.firewall.id
  }
}

resource "azurerm_virtual_network_dns_servers" "avd" {
  virtual_network_id = azurerm_virtual_network.avd.id
  dns_servers        = [local.firewall_private_ip]
}

resource "azurerm_firewall_policy_rule_collection_group" "avd_egress" {
  name               = "avd-required-egress"
  firewall_policy_id = azurerm_firewall_policy.avd.id
  priority           = 100

  application_rule_collection {
    name     = "avd-control-plane"
    priority = 100
    action   = "Allow"

    rule {
      name                  = "windows-virtual-desktop"
      source_addresses      = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
      destination_fqdn_tags = ["WindowsVirtualDesktop"]

      protocols {
        type = "Https"
        port = 443
      }
    }

    rule {
      name              = "avd-registration-package"
      source_addresses  = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
      destination_fqdns = ["wvdportalstorageblob.blob.core.windows.net"]

      protocols {
        type = "Https"
        port = 443
      }
    }
  }

  network_rule_collection {
    name     = "avd-platform-dependencies"
    priority = 200
    action   = "Allow"

    rule {
      name                  = "entra-id"
      protocols             = ["TCP"]
      source_addresses      = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
      destination_addresses = ["AzureActiveDirectory"]
      destination_ports     = ["443"]
    }

    rule {
      name                  = "extension-packages"
      protocols             = ["TCP"]
      source_addresses      = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
      destination_addresses = ["Storage.${var.PAW_LOCATION}"]
      destination_ports     = ["443"]
    }

    rule {
      name              = "windows-activation"
      protocols         = ["TCP"]
      source_addresses  = [var.SESSION_HOST_SUBNET_ADDRESS_PREFIX]
      destination_fqdns = ["kms.core.windows.net"]
      destination_ports = ["1688"]
    }
  }
}

resource "azurerm_route_table" "session_hosts" {
  name                          = "${var.HOST_POOL_NAME}-session-hosts-routes"
  location                      = azurerm_resource_group.avd.location
  resource_group_name           = azurerm_resource_group.avd.name
  bgp_route_propagation_enabled = false
  tags                          = var.TAGS

  route {
    name                   = "force-firewall-egress"
    address_prefix         = "0.0.0.0/0"
    next_hop_type          = "VirtualAppliance"
    next_hop_in_ip_address = local.firewall_private_ip
  }
}

resource "azurerm_subnet_route_table_association" "session_hosts" {
  subnet_id      = azurerm_subnet.session_hosts.id
  route_table_id = azurerm_route_table.session_hosts.id
}