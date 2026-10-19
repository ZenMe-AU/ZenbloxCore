# Born-locked AVD Private Link. This is part of the base deployment - there is
# no toggle. The session host's broker/gateway traffic moves onto the VNet via
# a private endpoint to the host pool "connection" sub-resource, and the host
# pool is set to EnabledForClientsOnly so session hosts can only connect
# through it (see avd.tf). Clients still subscribe to the feed over the
# internet because the workspace keeps public access.
#
# The endpoint reports roughly a dozen FQDNs (broker, diagnostics, gateway
# rings, web) over a handful of IPs; the exact set varies per deployment, so
# the A records are generated from custom_dns_configs. Those values only
# exist after the endpoint is applied, so deployPAW.ps1 applies the endpoint
# in a targeted first phase before the full plan/apply can succeed.

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

# Publish the endpoint's reported FQDNs as A records in the
# privatelink.wvd.microsoft.com zone. custom_dns_configs may report either the
# public-shaped FQDN (<name>.wvd.microsoft.com) or the private-shaped one
# (<name>.privatelink.wvd.microsoft.com); strip both suffixes so the record
# names land inside the zone correctly either way.
resource "azurerm_private_dns_a_record" "hostpool_connection" {
  for_each = {
    for cfg in azurerm_private_endpoint.hostpool_connection.custom_dns_configs : cfg.fqdn => cfg
  }

  name                = trimsuffix(trimsuffix(each.value.fqdn, ".privatelink.wvd.microsoft.com"), ".wvd.microsoft.com")
  zone_name           = azurerm_private_dns_zone.wvd.name
  resource_group_name = azurerm_resource_group.avd.name
  records             = each.value.ip_addresses
  ttl                 = 300
}
