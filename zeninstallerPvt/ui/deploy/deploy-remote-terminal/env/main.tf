
# =========================
# Resource Group
# =========================
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}


# =========================
# Log Analytics Workspace + Application Insights
# =========================
resource "azurerm_log_analytics_workspace" "law" {
  name                = var.log_analytics_workspace_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
}

resource "azurerm_application_insights" "ai" {
  name                = var.application_insights_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name
  application_type    = "web"
  workspace_id        = azurerm_log_analytics_workspace.law.id
  sampling_percentage = 10
}


# =========================
# Web PubSub
# The relay the browser and the GitHub runner both dial out to; neither needs an inbound port.
# =========================
resource "azurerm_web_pubsub" "wps" {
  name                = var.web_pubsub_name
  location            = azurerm_resource_group.rg.location
  resource_group_name = azurerm_resource_group.rg.name

  sku      = var.web_pubsub_sku
  capacity = var.web_pubsub_capacity
}

# Anonymous connect stays off: a client may only join with a token the backend or the runner signed.
resource "azurerm_web_pubsub_hub" "hub" {
  name                          = var.hub_name
  web_pubsub_id                 = azurerm_web_pubsub.wps.id
  anonymous_connections_enabled = false
}


# =========================
# Storage Account
# Holds the session table and the Function App's deployment container.
# =========================
resource "azurerm_storage_account" "sa" {
  name                     = var.storage_account_name
  resource_group_name      = azurerm_resource_group.rg.name
  location                 = azurerm_resource_group.rg.location
  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"
}

# One row per terminal session: the access token the browser minted, plus its expiry.
resource "azurerm_storage_table" "sessions" {
  name               = var.session_table_name
  storage_account_id = azurerm_storage_account.sa.id
}

resource "azurerm_storage_container" "fa" {
  name                  = lower("${var.function_app_name}-stor")
  storage_account_id    = azurerm_storage_account.sa.id
  container_access_type = "private"
}


# =========================
# Service Plan (Flex Consumption)
# =========================
resource "azurerm_service_plan" "plan" {
  name                = "${var.function_app_name}-plan"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "FC1"
}


# =========================
# Function App — register / negotiate / session / health
# =========================
resource "azurerm_function_app_flex_consumption" "fa" {
  name                = var.function_app_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  service_plan_id     = azurerm_service_plan.plan.id

  storage_container_type = "blobContainer"
  storage_container_endpoint = format(
    "%s%s",
    azurerm_storage_account.sa.primary_blob_endpoint,
    azurerm_storage_container.fa.name
  )
  storage_authentication_type = "SystemAssignedIdentity"
  runtime_name                = "node"
  runtime_version             = "22"

  identity {
    type = "SystemAssigned"
  }

  # No access key and no connection string: the backend reaches the session table and Web PubSub
  # through the identity below. See README.md for the code contract this expects.
  app_settings = {
    APPLICATIONINSIGHTS_AUTHENTICATION_STRING = "Authorization=AAD"
    AzureWebJobsStorage__accountName          = azurerm_storage_account.sa.name
    AzureWebJobsStorage__credential           = "managedidentity"
    AzureWebJobsStorage__queueServiceUri      = azurerm_storage_account.sa.primary_queue_endpoint
    AzureWebJobsStorage__tableServiceUri      = azurerm_storage_account.sa.primary_table_endpoint
    AzureWebJobsStorage__blobServiceUri       = azurerm_storage_account.sa.primary_blob_endpoint

    # A bare host, never a scheme — callers build https://<host> from this themselves.
    WEBPUBSUB_ENDPOINT = azurerm_web_pubsub.wps.hostname
    HUB_NAME           = azurerm_web_pubsub_hub.hub.name

    SESSION_TABLE_ACCOUNT_NAME = azurerm_storage_account.sa.name
    SESSION_TABLE_NAME         = azurerm_storage_table.sessions.name
  }

  site_config {
    application_insights_connection_string = azurerm_application_insights.ai.connection_string
    cors {
      # The browser calls /register and /negotiate itself, so its origin has to be listed.
      allowed_origins = compact(split(",", var.allowed_origins))
    }
  }

  lifecycle {
    ignore_changes = [
      app_settings["AzureWebJobsStorage"],            # prevent Terraform from adding this back
      tags["hidden-link: /app-insights-resource-id"], # added by Azure when AI is linked, diffs every apply
    ]
  }
}


# =========================
# Function App identity — every data-plane role the backend needs
# =========================
resource "azurerm_role_assignment" "blob_access" {
  scope                = azurerm_storage_account.sa.id
  role_definition_name = "Storage Blob Data Contributor"
  principal_id         = azurerm_function_app_flex_consumption.fa.identity[0].principal_id
}

resource "azurerm_role_assignment" "queue_access" {
  scope                = azurerm_storage_account.sa.id
  role_definition_name = "Storage Queue Data Contributor"
  principal_id         = azurerm_function_app_flex_consumption.fa.identity[0].principal_id
}

# Covers both the Functions runtime and the backend's own reads and writes of the session table.
resource "azurerm_role_assignment" "table_access" {
  scope                = azurerm_storage_account.sa.id
  role_definition_name = "Storage Table Data Contributor"
  principal_id         = azurerm_function_app_flex_consumption.fa.identity[0].principal_id
}

# Service Owner, not Service Reader: issuing a client token is a POST, and Reader is */read only.
resource "azurerm_role_assignment" "wps_access" {
  scope                = azurerm_web_pubsub.wps.id
  role_definition_name = "Web PubSub Service Owner"
  principal_id         = azurerm_function_app_flex_consumption.fa.identity[0].principal_id
}

resource "azurerm_role_assignment" "ai_access" {
  scope                = azurerm_application_insights.ai.id
  role_definition_name = "Monitoring Metrics Publisher"
  principal_id         = azurerm_function_app_flex_consumption.fa.identity[0].principal_id
}


# =========================
# Pipeline identity — GitHub Actions reaches Web PubSub through this, not through an access key
# =========================
resource "azuread_application" "pipeline" {
  display_name     = var.pipeline_app_name
  owners           = [data.azurerm_client_config.current.object_id]
  sign_in_audience = "AzureADMyOrg"
}

resource "azuread_service_principal" "pipeline" {
  client_id = azuread_application.pipeline.client_id
  owners    = [data.azurerm_client_config.current.object_id]
}

# One credential per GitHub environment: the sub claim carries the environment name.
resource "azuread_application_federated_identity_credential" "pipeline" {
  for_each = toset(var.github_oidc_subjects)

  application_id = azuread_application.pipeline.id
  display_name   = replace(replace(each.value, ":", "-"), "/", "-")
  description    = "GitHub Actions OIDC for ${each.value}"
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = each.value
}

# Service Owner, not Service Reader: the runner issues client tokens, and that is a POST.
resource "azurerm_role_assignment" "pipeline_wps" {
  scope                = azurerm_web_pubsub.wps.id
  role_definition_name = "Web PubSub Service Owner"
  principal_id         = azuread_service_principal.pipeline.object_id
}
