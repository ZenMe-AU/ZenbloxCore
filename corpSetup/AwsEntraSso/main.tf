// roles needed:
// Application.ReadWrite.All

//Create the resources to make sso inside on entra possible with aws

# Use the AWS gallery template so the enterprise app is created as
# "AWS Single-Account Access" instead of a custom SAML app.
data "azuread_application_template" "aws_single_account_access" {
  display_name = "AWS Single-Account Access"
}

resource "azuread_application_from_template" "aws_sso_corp" {
  display_name = var.app_name
  template_id  = data.azuread_application_template.aws_single_account_access.template_id
}

data "azuread_application" "aws_sso_corp" {
  object_id = azuread_application_from_template.aws_sso_corp.application_object_id
}

resource "azuread_service_principal" "aws_sso_corp" {
  client_id                     = data.azuread_application.aws_sso_corp.client_id
  preferred_single_sign_on_mode = "saml"
  app_role_assignment_required  = true
  use_existing                  = true
  feature_tags {
    enterprise = true
  }
}

resource "azuread_service_principal_token_signing_certificate" "aws_sso_corp" {
  service_principal_id = azuread_service_principal.aws_sso_corp.id
  display_name         = "CN=AWS SSO Signing"
  depends_on           = [azuread_service_principal.aws_sso_corp]
}

resource "azuread_application_identifier_uri" "aws_sso_corp" {
  application_id = data.azuread_application.aws_sso_corp.id
  identifier_uri = "https://signin.aws.amazon.com/saml#${azuread_application_from_template.aws_sso_corp.application_object_id}"
  depends_on     = [azuread_service_principal.aws_sso_corp] # Ensure sso mode is set as SAML before setting identifier URI
}
