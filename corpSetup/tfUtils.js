/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Sets a Terraform variable as an environment variable
 * @param {string} name - The variable name (without TF_VAR_ prefix)
 * @param {string} value - The variable value
 */
export function setTfVar(name, value) {
  const envKey = `TF_VAR_${name}`;
  process.env[envKey] = value;

  console.log(`Setting terraform variable ${name} to: ${value}`);
}
