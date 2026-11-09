// Note: this is under the assumption that all display names in users.csv are unique. In production, you'd want a more reliable key (e.g. email or a dedicated username column) to avoid ambiguity.
// This data source fetches all available role templates (e.g., "Global Administrator", "User Administrator") 
data "azuread_directory_role_templates" "eligible_roles" {
}

// Note: This requires elevated permissions (e.g. User Access Administrator) to manage role assignments in Entra ID
// Creates eligible role assignments
resource "azuread_directory_role_assignment" "eligible_roles" {
  for_each = {
    for a in local.eligible_role_assignments :
    "${a.upn}__${replace(lower(a.role_name), " ", "_")}" => a
  }

  role_id             = local.eligible_role_template_object_ids[each.value.role_name]
  principal_object_id = local.all_user_object_ids[each.value.upn]
}

output "eligible_role_assignment_details" {
  value = [
    for a in local.eligible_role_assignments :
    "Assigned role '${a.role_name}' to user '${a.display_name}'"
  ]
}

locals {
  # target UPNs from users.csv used to query existing Entra users
  target_upns = [for u in local.users_csv : lower(u.Upn)]
  # Existing users keyed by UPN
  existing_user_object_ids = length(local.target_upns) > 0 ? {
    for u in data.azuread_users.existing.users : lower(u.user_principal_name) => u.object_id
  } : {}
  # Resolve membership IDs from all known users (existing + managed/created).
  all_user_object_ids = merge(
    local.existing_user_object_ids,
    { for upn, u in azuread_user.users : lower(upn) => u.object_id }
  )
  # Flatten users.csv into user -> eligible role pairs.
  eligible_role_assignments = flatten([
    for upn, u in local.users_map : [
      for role_name in [for r in split(",", try(u.EligibleRoles, "")) : trimspace(r) if trimspace(r) != ""] : {
        upn           = upn
        display_name  = trimspace(u.DisplayName)
        role_name     = role_name
      }
    ]
  ])
  # Map role display name -> role template object_id from azuread_directory_role_templates.
  eligible_role_template_object_ids = {
    for rt in data.azuread_directory_role_templates.eligible_roles.role_templates : rt.display_name => rt.object_id
  }
}