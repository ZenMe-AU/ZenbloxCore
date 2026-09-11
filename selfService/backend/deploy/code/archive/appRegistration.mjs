/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * @file appRegistration.mjs
 * @description
 * Creates an Azure AD app registration for AccessPass-Backend-Graph2.
 * Reads tenant ID from .env file and creates the app registration in Azure.
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

async function deployAppRegistration() {
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

  // Verify Azure CLI is authenticated to the correct tenant
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

  // Create app registration
  const appName = "AccessPass-Backend-Graph2";
  console.log(`\nChecking if app registration "${appName}" already exists...`);

  try {
    // Check if app with this name already exists
    const listCommand = `az ad app list --filter "displayName eq '${appName}'" --output json`;
    const existingApps = JSON.parse(executeCommand(listCommand));

    if (existingApps && existingApps.length > 0) {
      const existingApp = existingApps[0];
      console.log(`\x1b[33m⚠ App registration "${appName}" already exists\x1b[0m`);
      console.log(`  Display Name: ${existingApp.displayName}`);
      console.log(`  App ID (Client ID): ${existingApp.appId}`);
      console.log(`  Object ID: ${existingApp.id}`);
      return;
    }

    // App doesn't exist, create it
    console.log(`Creating app registration: ${appName}...`);
    const createCommand = `az ad app create --display-name "${appName}" --sign-in-audience AzureADMyOrg --output json`;
    const appData = JSON.parse(executeCommand(createCommand));

    console.log(`✓ App registration created successfully`);
    console.log(`  Display Name: ${appData.displayName}`);
    console.log(`  App ID (Client ID): ${appData.appId}`);
    console.log(`  Object ID: ${appData.id}`);
  } catch (error) {
    throw error;
  }
}

// Main execution
deployAppRegistration().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
