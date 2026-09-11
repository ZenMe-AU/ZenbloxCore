/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * @file assignPermissions.mjs
 * @description
 * Assigns API permissions to the AccessPass-Backend-Graph2 app registration.
 * Adds GroupMember.ReadWrite.All and AdministrativeUnit.ReadWrite.All permissions.
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

async function assignPermissions() {
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

  // Find the app registration
  const appName = "AccessPass-Backend-Graph2";
  console.log(`\nLooking for app registration: ${appName}...`);

  let appId;
  try {
    const listCommand = `az ad app list --filter "displayName eq '${appName}'" --output json`;
    const existingApps = JSON.parse(executeCommand(listCommand));

    if (!existingApps || existingApps.length === 0) {
      throw new Error(`App registration "${appName}" not found`);
    }

    const existingApp = existingApps[0];
    appId = existingApp.appId;
    console.log(`✓ Found app registration: ${appName}`);
    console.log(`  App ID: ${appId}`);
  } catch (error) {
    throw error;
  }

  // Get Microsoft Graph service principal ID
  console.log(`\nGetting Microsoft Graph service principal ID...`);
  let graphSpId;
  const graphResourceAppId = "00000003-0000-0000-c000-000000000000"; // Microsoft Graph resource app ID
  try {
    const graphSpCommand = `az ad sp list --filter "displayName eq 'Microsoft Graph'" --output json`;
    const graphSps = JSON.parse(executeCommand(graphSpCommand));

    if (!graphSps || graphSps.length === 0) {
      throw new Error("Microsoft Graph service principal not found");
    }

    graphSpId = graphSps[0].id;
    console.log(`✓ Found Microsoft Graph service principal ID: ${graphSpId}`);
    console.log(`  Using resource app ID: ${graphResourceAppId}`);
  } catch (error) {
    throw error;
  }

  console.log(`\nAssigning API permissions...`);

  // Permissions to add (Application type)
  const requiredPermissions = [
    "dbaae8cf-10b5-4b86-a4a1-f871c94c6695", // GroupMember.ReadWrite.All
    "5eb59dd3-1da2-4329-8733-9dabdc435916", // AdministrativeUnit.ReadWrite.All
  ];

  try {
    // Get the app object ID (needed for PATCH request)
    console.log(`  Getting app object ID...`);
    const appDetailsCommand = `az ad app show --id ${appId} --output json`;
    const appDetails = JSON.parse(executeCommand(appDetailsCommand));
    const appObjectId = appDetails.id;
    console.log(`  App object ID: ${appObjectId}`);

    // Build the permission request body
    const requiredResourceAccess = {
      resourceAppId: graphResourceAppId,
      resourceAccess: requiredPermissions.map((permId) => ({
        id: permId,
        type: "Role",
      })),
    };

    // Use Microsoft Graph API directly to add permissions
    const patchBody = {
      requiredResourceAccess: [requiredResourceAccess],
    };

    // Write JSON to temp file to avoid shell escaping issues
    const tempFile = path.join(os.tmpdir(), `permissions-${Date.now()}.json`);
    fs.writeFileSync(tempFile, JSON.stringify(patchBody));

    try {
      console.log(`  Applying permissions via Microsoft Graph API...`);
      const graphCommand = `az rest --method PATCH --uri https://graph.microsoft.com/v1.0/applications/${appObjectId} --headers Content-Type=application/json --body @${tempFile}`;

      const graphResult = executeCommand(graphCommand);
      console.log(`  ✓ Permissions applied successfully`);
    } finally {
      // Clean up temp file
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    }

    // Verify permissions were actually added
    console.log(`  Verifying permissions...`);
    const verifyCommand = `az ad app show --id ${appId} --output json`;
    const verifiedApp = JSON.parse(executeCommand(verifyCommand));

    if (verifiedApp.requiredResourceAccess && verifiedApp.requiredResourceAccess.length > 0) {
      const graphAccess = verifiedApp.requiredResourceAccess.find((r) => r.resourceAppId === graphResourceAppId);
      if (graphAccess && graphAccess.resourceAccess.length > 0) {
        console.log(`  ✓ Found ${graphAccess.resourceAccess.length} permission(s):`);
        graphAccess.resourceAccess.forEach((perm) => {
          const permName =
            perm.id === "dbaae8cf-10b5-4b86-a4a1-f871c94c6695"
              ? "GroupMember.ReadWrite.All"
              : perm.id === "5eb59dd3-1da2-4329-8733-9dabdc435916"
                ? "AdministrativeUnit.ReadWrite.All"
                : perm.id;
          console.log(`    - ${permName} (${perm.id})`);
        });
      } else {
        throw new Error("No permissions found for Microsoft Graph");
      }
    } else {
      throw new Error("No requiredResourceAccess found on app");
    }
  } catch (error) {
    console.error(`  ✗ Failed to assign permissions: ${error.message}`);
    throw error;
  }

  // Grant admin consent for the permissions
  // console.log(`\nGranting admin consent...`);
  // try {
  //   const grantCommand = `az ad app permission admin-consent --id ${appId}`;
  //   const grantResult = executeCommand(grantCommand);
  //   console.log(`✓ Admin consent granted for all permissions`);
  // } catch (error) {
  //   if (error.message.includes("has not subscribed to")) {
  //     console.warn(`\n⚠ Admin consent could not be granted automatically`);
  //     console.warn(`  Reason: Your organization has not subscribed to the required services`);
  //     console.warn(`  Action: You may need to grant consent manually in the Azure Portal`);
  //   } else {
  //     console.warn(`\n⚠ Admin consent could not be granted: ${error.message}`);
  //     console.warn(`  You may need to grant consent manually in the Azure Portal`);
  //   }
  // }

  console.log(`\n✓ API permissions assignment completed successfully!`);
}

// Main execution
assignPermissions().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
