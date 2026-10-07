# Optional lockdown for new deployments.
# Set TF_VAR_LOCKDOWN=true in the parent .env before running deployPAW.ps1,
# or toggle the live stack with pawLockdown.ps1 / pawOpen.ps1 afterwards.
#
# Lockdown mode:
#   - A private endpoint to the host pool "connection" sub-resource moves the
#     session host's AVD broker/gateway traffic onto the VNet.
#   - The session-hosts NSG gets an outbound allow-list (private endpoint,
#     Entra auth, residual AVD agent endpoints, Azure DNS) and a final deny
#     rule that blocks all other outbound internet traffic.
#   - Windows Update, Edge, agent updates and Windows activation renewals
#     stop working until LOCKDOWN=false is applied or pawOpen.ps1 is run.

resource "azurerm_subnet" "private_endpoints" {
  count               = var.LOCKDOWN ? 1 : 0
  name                = "private-endpoints"
  resource_group_name = azurerm_resource_group.avd.name
  virtual_network_name = azurerm_virtual_network.avd.name
  address_prefixes     = [var.PRIVATE_ENDPOINTS_SUBNET_ADDRESS_PREFIX]
}

resource "azurerm_private_dns_zone" "wvd" {
  count               = var.LOCKDOWN ? 1 : 0
  name                = "privatelink.wvd.microsoft.com"
  resource_group_name = azurerm_resource_group.avd.name
  tags                = var.TAGS
}

resource "azurerm_private_dns_zone_virtual_network_link" "wvd" {
  count               = var.LOCKDOWN ? 1 : 0
  name                = "${var.HOST_POOL_NAME}-wvd-link"
  resource_group_name = azurerm_resource_group.avd.name
  private_dns_zone_name = azurerm_private_dns_zone.wvd[0].name
  virtual_network_id    = azurerm_virtual_network.avd.id
  registration_enabled  = false
  tags                  = var.TAGS
}

resource "azurerm_private_endpoint" "hostpool_connection" {
  count               = var.LOCKDOWN ? 1 : 0
  name                = "${var.HOST_POOL_NAME}-lockdown-pe"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  subnet_id           = azurerm_subnet.private_endpoints[0].id
  tags                = var.TAGS

  private_service_connection {
    name                           = "${var.HOST_POOL_NAME}-conn"
    private_connection_resource_id = azurerm_virtual_desktop_host_pool.pooled.id
    subresource_names              = ["connection"]
  }

  private_dns_zone_group {
    name                 = "wvd"
    private_dns_zone_ids = [azurerm_private_dns_zone.wvd[0].id]
  }
}

resource "azurerm_network_security_rule" "lockdown_allow_pe" {
  count                       = var.LOCKDOWN ? 1 : 0
  name                        = "LockdownAllow-PrivateEndpoint"
  priority                    = 100
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "443"
  source_address_prefix       = "VirtualNetwork"
  destination_address_prefix = var.PRIVATE_ENDPOINTS_SUBNET_ADDRESS_PREFIX
  network_security_group_id   = azurerm_network_security_group.session_hosts.id
}

resource "azurerm_network_security_rule" "lockdown_allow_entra" {
  count                       = var.LOCKDOWN ? 1 : 0
  name                        = "LockdownAllow-EntraAuth"
  priority                    = 110
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "VirtualNetwork"
  destination_address_prefix = "AzureActiveDirectory"
  network_security_group_id   = azurerm_network_security_group.session_hosts.id
}

resource "azurerm_network_security_rule" "lockdown_allow_agent" {
  count                       = var.LOCKDOWN ? 1 : 0
  name                        = "LockdownAllow-AvdAgent"
  priority                    = 120
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "Tcp"
  source_port_range           = "*"
  destination_port_range      = "443"
  source_address_prefix       = "VirtualNetwork"
  destination_address_prefix = "WindowsVirtualDesktop"
  network_security_group_id   = azurerm_network_security_group.session_hosts.id
}

resource "azurerm_network_security_rule" "lockdown_allow_dns" {
  count                       = var.LOCKDOWN ? 1 : 0
  name                        = "LockdownAllow-AzureDns"
  priority                    = 130
  direction                   = "Outbound"
  access                      = "Allow"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "53"
  source_address_prefix       = "VirtualNetwork"
  destination_address_prefix = "AzureDNS"
  network_security_group_id   = azurerm_network_security_group.session_hosts.id
}

resource "azurerm_network_security_rule" "lockdown_deny_internet" {
  count                       = var.LOCKDOWN ? 1 : 0
  name                        = "LockdownDeny-InternetOutbound"
  priority                    = 4090
  direction                   = "Outbound"
  access                      = "Deny"
  protocol                    = "*"
  source_port_range           = "*"
  destination_port_range      = "*"
  source_address_prefix       = "VirtualNetwork"
  destination_address_prefix = "Internet"
  network_security_group_id   = azurerm_network_security_group.session_hosts.id
}