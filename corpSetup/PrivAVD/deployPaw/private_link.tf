# Born-locked AVD Private Link. This is part of the base deployment - there is
# no toggle. The session host's broker/gateway traffic moves onto the VNet via
# a private endpoint to the host pool "connection" sub-resource, and the host
# pool is set to EnabledForSessionHostsOnly so session hosts can only connect
# through it (see avd.tf). Clients still subscribe to the feed over the
# internet because the workspace keeps public access.
#
# Azure does not auto-create A records for AVD host-pool private endpoints
# even with a private_dns_zone_group attached, so the explicit
# azurerm_private_dns_a_record below is required for name resolution.

resource "azurerm_subnet" "private_endpoints" {
  name                            = "private-endpoints"
  resource_group_name             = azurerm_resource_group.avd.name
  virtual_network_name            = azurerm_virtual_network.avd.name
  address_prefixes                = [var.PRIVATE_ENDPOINTS_SUBNET_ADDRESS_PREFIX]
  default_outbound_access_enabled = false
}

resource "azurerm_private_dns_zone" "wvd" {
  name                = "privatelink.wvd.microsoft.com"
  resource_group_name = azurerm_resource_group.avd.name
  tags                = var.TAGS
}

resource "azurerm_private_dns_zone_virtual_network_link" "wvd" {
  name                  = "${var.HOST_POOL_NAME}-wvd-link"
  resource_group_name   = azurerm_resource_group.avd.name
  private_dns_zone_name = azurerm_private_dns_zone.wvd.name
  virtual_network_id    = azurerm_virtual_network.avd.id
  registration_enabled  = false
  tags                  = var.TAGS
}

resource "azurerm_private_endpoint" "hostpool_connection" {
  name                = "${var.HOST_POOL_NAME}-connection-pe"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  subnet_id           = azurerm_subnet.private_endpoints.id
  tags                = var.TAGS

  private_service_connection {
    name                           = "${var.HOST_POOL_NAME}-conn"
    private_connection_resource_id = azurerm_virtual_desktop_host_pool.pooled.id
    subresource_names              = ["connection"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "wvd"
    private_dns_zone_ids = [azurerm_private_dns_zone.wvd.id]
  }
}

# Azure leaves the privatelink.wvd.microsoft.com zone empty for host-pool
# private endpoints, so publish the endpoint's IPs as A records for each
# fully-qualified domain name the endpoint reports (broker, diagnostics,
# gateway-ring-map, web).
resource "azurerm_private_dns_a_record" "hostpool_connection" {
  for_each = {
    for cfg in azurerm_private_endpoint.hostpool_connection.custom_dns_configs : cfg.fqdn => cfg
  }

  name                = trimsuffix(each.value.fqdn, ".privatelink.wvd.microsoft.com")
  zone_name           = azurerm_private_dns_zone.wvd.name
  resource_group_name = azurerm_resource_group.avd.name
  records             = each.value.ip_addresses
  ttl                 = 300
}