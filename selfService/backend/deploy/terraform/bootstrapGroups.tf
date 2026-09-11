/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

# Equivalent of bootstrapGroups.mjs: creates the Pass Reset Managers2 security group.
resource "azuread_group" "pass_reset_managers" {
  display_name     = "Pass Reset Managers2"
  mail_nickname    = "PassResetManagers2"
  security_enabled = true
}
