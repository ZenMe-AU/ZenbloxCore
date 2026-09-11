/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * @file bootstrapAdministrativeUnits.mjs
 * @description
 * Creates Azure AD administrative units required for AccessPass deployment.
 * Creates "Pass Reset Targets2" administrative unit if it does not already exist.
 * @copyright 2026 Zenme Pty Ltd
 * @license MIT
 */

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";

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

async function bootstrapAdministrativeUnits() {
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

  // Create administrative units
  const administrativeUnitsToCreate = [
    {
      displayName: "Pass Reset Targets2",
    },
  ];

  for (const au of administrativeUnitsToCreate) {
    console.log(`\nChecking if administrative unit "${au.displayName}" already exists...`);

    try {
      // Check if administrative unit with this name already exists using Microsoft Graph API
      const listCommand = `az rest --method GET --uri "https://graph.microsoft.com/beta/directory/administrativeUnits?$filter=displayName eq '${au.displayName}'" --output json`;
      const listResult = JSON.parse(executeCommand(listCommand));
      const existingAUs = listResult.value || [];

      if (existingAUs && existingAUs.length > 0) {
        const existingAU = existingAUs[0];
        console.log(`\x1b[33m⚠ Administrative unit "${au.displayName}" already exists\x1b[0m`);
        console.log(`  Display Name: ${existingAU.displayName}`);
        console.log(`  Object ID: ${existingAU.id}`);
        continue;
      }

      // Administrative unit doesn't exist, create it
      console.log(`Creating administrative unit: ${au.displayName}...`);
      const createBody = JSON.stringify({
        displayName: au.displayName,
      });

      // Write body to temporary file to avoid quote escaping issues
      const tempFile = path.join(os.tmpdir(), `au-${Date.now()}.json`);
      fs.writeFileSync(tempFile, createBody, "utf8");

      try {
        const createCommand = `az rest --method POST --uri "https://graph.microsoft.com/beta/directory/administrativeUnits" --body @${tempFile} --output json`;
        const auData = JSON.parse(executeCommand(createCommand));

        console.log(`✓ Administrative unit created successfully`);
        console.log(`  Display Name: ${auData.displayName}`);
        console.log(`  Object ID: ${auData.id}`);
      } finally {
        // Clean up temporary file
        fs.unlinkSync(tempFile);
      }
    } catch (error) {
      throw error;
    }
  }

  console.log("\n✓ Administrative unit bootstrap completed successfully!");
}

// Main execution
bootstrapAdministrativeUnits().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
