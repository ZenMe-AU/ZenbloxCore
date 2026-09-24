data "azurerm_shared_image_version" "paw" {
  name                = var.image_version
  image_name          = var.image_name
  gallery_name        = var.gallery_name
  resource_group_name = var.gallery_resource_group_name
}

resource "azurerm_resource_group" "avd" {
  name     = var.resource_group_name
  location = var.location
  tags     = var.tags
}

resource "azurerm_virtual_desktop_host_pool" "pooled" {
  name                     = var.host_pool_name
  location                 = azurerm_resource_group.avd.location
  resource_group_name      = azurerm_resource_group.avd.name
  type                     = "Pooled"
  maximum_sessions_allowed = 20
  load_balancer_type       = "BreadthFirst"
  start_vm_on_connect      = true
  validate_environment     = false
  custom_rdp_properties    = "targetisaadjoined:i:1;"
  tags                     = var.tags
}

resource "azurerm_virtual_desktop_workspace" "workspace" {
  name                = var.workspace_name
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  friendly_name       = "Privileged Access Workstations"
  description         = "Shared multi-session PAW desktop workspace."
  tags                = var.tags
}

resource "azurerm_virtual_desktop_application_group" "desktop" {
  name                = var.application_group_name
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  type                = "Desktop"
  host_pool_id        = azurerm_virtual_desktop_host_pool.pooled.id
  friendly_name       = "Privileged Access Workstations"
  description         = "Desktop application group for the pooled PAW host pool."
  tags                = var.tags
}

resource "azurerm_virtual_desktop_workspace_application_group_association" "desktop" {
  workspace_id         = azurerm_virtual_desktop_workspace.workspace.id
  application_group_id = azurerm_virtual_desktop_application_group.desktop.id
}

resource "azurerm_virtual_desktop_host_pool_registration_info" "pooled" {
  hostpool_id     = azurerm_virtual_desktop_host_pool.pooled.id
  expiration_date = timeadd(timestamp(), "24h")
}

resource "azurerm_virtual_desktop_scaling_plan" "pooled" {
  name                = "${var.host_pool_name}-scaling"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  time_zone           = var.timezone
  description         = "Deallocates idle PAW session hosts outside business hours."
  tags                = var.tags

  schedule {
    name                                 = "weekday"
    days_of_week                         = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
    ramp_up_start_time                   = "07:00"
    ramp_up_load_balancing_algorithm     = "BreadthFirst"
    ramp_up_minimum_hosts_percent        = 0
    peak_start_time                      = "09:00"
    peak_load_balancing_algorithm        = "BreadthFirst"
    ramp_down_start_time                 = "18:00"
    ramp_down_load_balancing_algorithm   = "DepthFirst"
    ramp_down_capacity_threshold_percent = 50
    ramp_down_minimum_hosts_percent      = 0
    ramp_down_force_logoff_users         = false
    ramp_down_stop_hosts_when            = "ZeroActiveSessions"
    ramp_down_wait_time_minutes          = 30
    ramp_down_notification_message       = "This session host is being shut down because it is outside the PAW usage window."
    off_peak_start_time                  = "22:00"
    off_peak_load_balancing_algorithm    = "DepthFirst"
  }
}

resource "azurerm_virtual_desktop_scaling_plan_host_pool_association" "pooled" {
  scaling_plan_id = azurerm_virtual_desktop_scaling_plan.pooled.id
  host_pool_id    = azurerm_virtual_desktop_host_pool.pooled.id
  enabled         = true
}