# The group itself is created by corpSetup/c02globalGroups; this module only grants it access.
data "azuread_group" "paw_login" {
  display_name = var.PAW_GROUP
}

data "azurerm_shared_image_version" "paw" {
  name                = var.IMAGE_VERSION
  image_name          = var.IMAGE_NAME
  gallery_name        = var.GALLERY_RG
  resource_group_name = var.GALLERY_RG
}

resource "azurerm_resource_group" "avd" {
  name     = "${var.HOST_POOL_NAME}-rg"
  location = var.PAW_LOCATION
  tags     = var.TAGS
}

resource "azurerm_virtual_desktop_host_pool" "pooled" {
  name                     = var.HOST_POOL_NAME
  location                 = azurerm_resource_group.avd.location
  resource_group_name      = azurerm_resource_group.avd.name
  type                     = "Pooled"
  maximum_sessions_allowed = 20
  load_balancer_type       = "BreadthFirst"
  start_vm_on_connect      = true
  validate_environment     = false
  custom_rdp_properties    = "targetisaadjoined:i:1;enablerdsaadauth:i:1;"
  tags                     = var.TAGS
}

resource "azurerm_virtual_desktop_workspace" "workspace" {
  name                = var.WORKSPACE_NAME
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  friendly_name       = "Privileged Access Workstations"
  description         = "Shared multi-session PAW desktop workspace."
  tags                = var.TAGS
}

resource "azurerm_virtual_desktop_application_group" "desktop" {
  name                         = var.APPLICATION_GROUP_NAME
  location                     = azurerm_resource_group.avd.location
  resource_group_name          = azurerm_resource_group.avd.name
  default_desktop_display_name = var.HOST_POOL_NAME
  type                         = "Desktop"
  host_pool_id                 = azurerm_virtual_desktop_host_pool.pooled.id
  friendly_name                = "Privileged Access Workstations"
  description                  = "Desktop application group for the pooled PAW host pool."
  tags                         = var.TAGS
}

resource "azurerm_virtual_desktop_workspace_application_group_association" "desktop" {
  workspace_id         = azurerm_virtual_desktop_workspace.workspace.id
  application_group_id = azurerm_virtual_desktop_application_group.desktop.id
}

resource "azurerm_virtual_desktop_application_group" "remoteapp" {
  name                = "${var.APPLICATION_GROUP_NAME}-ra"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  type                = "RemoteApp"
  host_pool_id        = azurerm_virtual_desktop_host_pool.pooled.id
  friendly_name       = "PAW RemoteApps"
  description         = "Remote applications for PAW users."
  tags                = var.TAGS
}

resource "azurerm_virtual_desktop_workspace_application_group_association" "remoteapp" {
  workspace_id         = azurerm_virtual_desktop_workspace.workspace.id
  application_group_id = azurerm_virtual_desktop_application_group.remoteapp.id
}

resource "azurerm_virtual_desktop_application" "edge" {
  name                         = "edge"
  application_group_id         = azurerm_virtual_desktop_application_group.remoteapp.id
  friendly_name                = "Microsoft Edge"
  description                  = "Microsoft Edge browser"
  path                         = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"
  command_line_argument_policy = "DoNotAllow"
  show_in_portal               = true
}


resource "azurerm_virtual_desktop_host_pool_registration_info" "pooled" {
  hostpool_id     = azurerm_virtual_desktop_host_pool.pooled.id
  expiration_date = timeadd(timestamp(), "24h")
}

resource "azurerm_virtual_desktop_scaling_plan" "pooled" {
  name                = "${var.HOST_POOL_NAME}-scaling"
  location            = azurerm_resource_group.avd.location
  resource_group_name = azurerm_resource_group.avd.name
  time_zone           = var.TIMEZONE
  description         = "Deallocates the PAW session host whenever it has no active sessions."
  tags                = var.TAGS

  schedule {
    name                                 = "daily"
    days_of_week                         = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    ramp_up_start_time                   = "00:00"
    ramp_up_load_balancing_algorithm     = "BreadthFirst"
    ramp_up_minimum_hosts_percent        = 1
    ramp_up_capacity_threshold_percent   = 1
    peak_start_time                      = "00:15"
    peak_load_balancing_algorithm        = "BreadthFirst"
    ramp_down_start_time                 = "00:30"
    ramp_down_load_balancing_algorithm   = "DepthFirst"
    ramp_down_capacity_threshold_percent = 50
    ramp_down_minimum_hosts_percent      = 0
    ramp_down_force_logoff_users         = false
    ramp_down_stop_hosts_when            = "ZeroActiveSessions"
    ramp_down_wait_time_minutes          = 30
    ramp_down_notification_message       = "This PAW session host is being shut down because it has no active sessions."
    off_peak_start_time                  = "23:45"
    off_peak_load_balancing_algorithm    = "DepthFirst"
  }
}

resource "azurerm_virtual_desktop_scaling_plan_host_pool_association" "pooled" {
  scaling_plan_id = azurerm_virtual_desktop_scaling_plan.pooled.id
  host_pool_id    = azurerm_virtual_desktop_host_pool.pooled.id
  enabled         = true

  depends_on = [azurerm_role_assignment.avd_power_management]
}

# "Desktop Virtualization User" lets members enumerate and launch this application group; it does not grant Azure resource access.
resource "azurerm_role_assignment" "paw_login_desktop" {
  scope                = azurerm_virtual_desktop_application_group.desktop.id
  role_definition_name = "Desktop Virtualization User"
  principal_id         = data.azuread_group.paw_login.object_id
}

# "Virtual Machine User Login" lets members complete Entra ID authentication on the session hosts themselves.
resource "azurerm_role_assignment" "paw_login_vm" {
  scope                = azurerm_resource_group.avd.id
  role_definition_name = "Virtual Machine User Login"
  principal_id         = data.azuread_group.paw_login.object_id
}
