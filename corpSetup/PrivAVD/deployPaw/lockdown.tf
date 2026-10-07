# Optional lockdown for new deployments.
# Set TF_VAR_LOCKDOWN=true in the parent .env before running deployPAW.ps1,
# or toggle the live stack with pawLockdown.ps1 / pawOpen.ps1 afterwards.
#
# Lockdown mode:
#   - A private endpoint to the host pool "connection" sub-resource moves the
#     session host's AVD broker/gateway traffic onto the VNet.
#   - The session-hosts NSG gets an outbound allow-list (private endpoint,
#     Entra auth, residual AVD agent endpoints, Azure DNS) and a final deny
#     rule that blocks all other outbound internet traffic. The rules are
#     inline blocks on the NSG (see network.tf dynamic security_rule) because
#     azurerm forbids mixing inline blocks with standalone rule resources.
#   - Windows Update, Edge, agent updates and Windows activation renewals
#     stop working until LOCKDOWN=false is applied or pawOpen.ps1 is run.

locals {
  lockdown_rules = [
    {
      name     = "LockdownAllow-PrivateEndpoint"
      priority = 100
      access   = "Allow"
      protocol = "Tcp"
      ports    = "443"
      dest     = var.PRIVATE_ENDPOINTS_SUBNET_ADDRESS_PREFIX
    },
    {
      name     = "LockdownAllow-EntraAuth"
      priority = 110
      access   = "Allow"
      protocol = "*"
      ports    = "*"
      dest     = "AzureActiveDirectory"
    },
    {
      name     = "LockdownAllow-AvdAgent"
      priority = 120
      access   = "Allow"
      protocol = "Tcp"
      ports    = "443"
      dest     = "WindowsVirtualDesktop"
    },
    {
      name     = "LockdownAllow-AzureDns"
      priority = 130
      access   = "Allow"
      protocol = "*"
      ports    = "53"
      dest     = "AzureDNS"
    },
    {
      name     = "LockdownDeny-InternetOutbound"
      priority = 4090
      access   = "Deny"
      protocol = "*"
      ports    = "*"
      dest     = "Internet"
    }
  ]
}

resource "azurerm_subnet" "private_endpoints" {
  count                = var.LOCKDOWN ? 1 : 0
  name                 = "private-endpoints"
  resource_group_name  = azurerm_resource_group.avd.name
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
  count                 = var.LOCKDOWN ? 1 : 0
  name                  = "${var.HOST_POOL_NAME}-wvd-link"
  resource_group_name   = azurerm_resource_group.avd.name
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
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "wvd"
    private_dns_zone_ids = [azurerm_private_dns_zone.wvd[0].id]
  }
}