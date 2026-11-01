locals {
  msiam_app_role = one([
    for r in data.azuread_application.aws_sso_corp.app_roles : r
    if r.display_name == "msiam_access"
  ])
}

# add LeadDeveloper group to AWS SSO Corp application
resource "azuread_app_role_assignment" "group_to_app" {
  principal_object_id = data.azuread_group.lead_developer.object_id
  app_role_id         = local.msiam_app_role.id
  resource_object_id  = data.azuread_service_principal.aws_sso_corp.object_id
}

# get LeadDeveloper group data source for later use in role assignment in AWS
data "azuread_group" "lead_developer" {
  display_name = "LeadDeveloper"
}
