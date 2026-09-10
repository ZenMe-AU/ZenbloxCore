/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * @file bootstrapGroups.mjs
 * @description
 * Creates Azure AD groups required for AccessPass deployment.
 * Creates "Pass Reset Managers2" group if it does not already exist.
 * @copyright 2026 Zenme Pty Ltd
 * @license MIT
 */

import { execSync } from "child_process";
import fs from "fs";

function executeCommand(command) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(`${error.message}`);
  }
}

function readEnvFile(envFilePath) {
  if (!fs.existsSync(envFilePath)) {
    throw new Error(`Environment file not found: ${envFilePath}`);
  }

  const content = fs.readFileSync(envFilePath, "utf8");
  const env = {};

  content.split("\n").forEach((line) => {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const [key, ...valueParts] = trimmed.split("=");
      if (key) {
        env[key] = valueParts.join("=");
      }
    }
  });

  return env;
}

async function bootstrapGroups() {
  const envFilePath = process.env.ENV_FILE;

  if (!envFilePath) {
    throw new Error("ENV_FILE environment variable not set");
  }

  console.log(`Reading configuration from: ${envFilePath}`);
  const env = readEnvFile(envFilePath);

  const tenantId = env.VITE_AZURE_TENANT_ID;

  if (!tenantId) {
    throw new Error("VITE_AZURE_TENANT_ID not found in .env file");
  }

  console.log(`Tenant ID: ${tenantId}`);

  // Verify Azure CLI is authenticated
  console.log("Verifying Azure authentication...");
  try {
    const accountInfo = JSON.parse(executeCommand("az account show --output json"));
    const currentTenant = accountInfo.tenantId;
    console.log(`Currently authenticated to tenant: ${currentTenant}`);

    if (currentTenant !== tenantId) {
      console.log(`Switching to target tenant ${tenantId}...`);
      executeCommand(`az login --tenant ${tenantId} --allow-no-subscriptions`);
    }
  } catch (error) {
    throw new Error("Azure CLI authentication required. Run 'az login' and try again.");
  }

  // Create groups
  const groupsToCreate = [
    {
      displayName: "Pass Reset Managers2",
      mailNickname: "PassResetManagers2",
    },
  ];

  for (const group of groupsToCreate) {
    console.log(`\nChecking if group "${group.displayName}" already exists...`);

    try {
      // Check if group with this name already exists
      const listCommand = `az ad group list --filter "displayName eq '${group.displayName}'" --output json`;
      const existingGroups = JSON.parse(executeCommand(listCommand));

      if (existingGroups && existingGroups.length > 0) {
        const existingGroup = existingGroups[0];
        console.log(`\x1b[33m⚠ Group "${group.displayName}" already exists\x1b[0m`);
        console.log(`  Display Name: ${existingGroup.displayName}`);
        console.log(`  Object ID: ${existingGroup.id}`);
        continue;
      }

      // Group doesn't exist, create it
      console.log(`Creating group: ${group.displayName}...`);
      const createCommand = `az ad group create --display-name "${group.displayName}" --mail-nickname "${group.mailNickname}" --output json`;
      const groupData = JSON.parse(executeCommand(createCommand));

      console.log(`✓ Group created successfully`);
      console.log(`  Display Name: ${groupData.displayName}`);
      console.log(`  Object ID: ${groupData.id}`);
    } catch (error) {
      throw error;
    }
  }

  console.log("\n✓ Group bootstrap completed successfully!");
}

// Main execution
bootstrapGroups().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
