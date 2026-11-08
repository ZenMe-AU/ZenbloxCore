// Add groups from groups.csv
resource "azuread_group" "security_groups" {
  for_each = { for group in local.groups_csv : group.GroupName => group }

  display_name     = each.value.GroupName
  description      = each.value.Description
  security_enabled = true
  mail_enabled     = false
  assignable_to_role = false
}

// Add users to groups (azuread_group_member resources)
resource "azuread_group_member" "membership" {
  for_each = { for m in local.user_memberships : "${m.upn}__${m.group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.group].object_id
  member_object_id = local.all_user_object_ids[each.value.upn]
}

// Add groups to groups (child group memberships in parent groups)
resource "azuread_group_member" "group_membership" {
  for_each = { for m in local.group_memberships : "${m.child_group}__${m.parent_group}" => m }

  group_object_id  = azuread_group.security_groups[each.value.parent_group].object_id
  member_object_id = azuread_group.security_groups[each.value.child_group].object_id
}

locals {
  # loads groups.csv -> used by azuread_group
  groups_csv = csvdecode(file("${path.module}/groups.csv"))
  # flattened list of child-group -> parent-group mappings from groups.csv
  group_memberships = flatten([
    for g in local.groups_csv : [
      for parent in [for p in split(",", g.MemberOfGroups) : trimspace(p) if trimspace(p) != ""] : {
        child_group  = g.GroupName
        parent_group = parent
      }
    ]
  ])
  # flattened list of user -> group mappings for group membership resource
  user_memberships = flatten([
    for upn, u in local.users_map : [
      for g in [for group in split(",", u.MemberOfGroups) : trimspace(group) if trimspace(group) != ""] : {
        upn   = upn
        group = g
      }
    ]
  ])
}