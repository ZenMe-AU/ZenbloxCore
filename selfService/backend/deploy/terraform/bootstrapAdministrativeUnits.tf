/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

# Equivalent of bootstrapAdministrativeUnits.mjs: creates the Pass Reset Targets2 administrative unit.
resource "azuread_administrative_unit" "pass_reset_targets" {
  display_name = "Pass Reset Targets2"
}
