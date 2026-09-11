/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * @file deployTerraform.js
 * @description
 * Reads the tenant ID from .env, imports any pre-existing Azure AD app registration,
 * group or administrative unit into terraform state, then runs terraform init/apply
 * to deploy the Azure AD resources (app registration, groups, administrative units, permissions).
 * @copyright 2026 Zenme Pty Ltd
 * @license MIT
 */

import { execSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const terraformDir = path.join(__dirname, "..", "terraform");

const APP_DISPLAY_NAME = "AccessPass-Backend-Graph2";
const GROUP_DISPLAY_NAME = "Pass Reset Managers2";
const ADMIN_UNIT_DISPLAY_NAME = "Pass Reset Targets2";
const GRAPH_RESOURCE_APP_ID = "00000003-0000-0000-c000-000000000000"; // Microsoft Graph resource app ID
const GRAPH_ROLE_IDS = [
  "dbaae8cf-10b5-4b86-a4a1-f871c94c6695", // GroupMember.ReadWrite.All
  "5eb59dd3-1da2-4329-8733-9dabdc435916", // AdministrativeUnit.ReadWrite.All
];

// Runs a shell command and returns its trimmed stdout
function executeCommand(command, options = {}) {
  return execSync(command, {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    ...options,
  }).trim();
}

// Runs a terraform command in the terraform directory, streaming output to the console
function runTerraform(command) {
  execSync(command, { stdio: "inherit", cwd: terraformDir });
}

// Parses a simple KEY=VALUE .env file into an object
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

// Confirms az cli is logged in, switching tenants if the current session doesn't match
function ensureAzureAuth(tenantId) {
  console.log("Verifying Azure authentication...");
  const accountInfo = JSON.parse(executeCommand("az account show --output json"));
  console.log(`Currently authenticated to tenant: ${accountInfo.tenantId}`);

  if (accountInfo.tenantId !== tenantId) {
    console.log(`Switching to target tenant ${tenantId}...`);
    executeCommand(`az login --tenant ${tenantId} --allow-no-subscriptions`);
  }
}

// Looks up the object ID of an existing app registration by display name, if any
function findExistingAppObjectId() {
  const listCommand = `az ad app list --filter "displayName eq '${APP_DISPLAY_NAME}'" --output json`;
  const apps = JSON.parse(executeCommand(listCommand));
  return apps?.[0]?.id ?? null;
}

// Looks up the object ID of an existing group by display name, if any
function findExistingGroupObjectId() {
  const listCommand = `az ad group list --filter "displayName eq '${GROUP_DISPLAY_NAME}'" --output json`;
  const groups = JSON.parse(executeCommand(listCommand));
  return groups?.[0]?.id ?? null;
}

// Looks up the object ID of an existing administrative unit by display name, if any
function findExistingAdministrativeUnitObjectId() {
  const listCommand = `az rest --method GET --uri "https://graph.microsoft.com/beta/directory/administrativeUnits?$filter=displayName eq '${ADMIN_UNIT_DISPLAY_NAME}'" --output json`;
  const result = JSON.parse(executeCommand(listCommand));
  return result?.value?.[0]?.id ?? null;
}

// Looks up the client (application) ID of an app registration from its object ID
function findAppClientId(appObjectId) {
  const appDetails = JSON.parse(executeCommand(`az ad app show --id ${appObjectId} --output json`));
  return appDetails?.appId ?? null;
}

// Looks up the object ID of an existing service principal for the given client ID, if any
function findExistingServicePrincipalObjectId(clientId) {
  const listCommand = `az ad sp list --filter "appId eq '${clientId}'" --output json`;
  const servicePrincipals = JSON.parse(executeCommand(listCommand));
  return servicePrincipals?.[0]?.id ?? null;
}

// Returns the Microsoft Graph resource app ID if the app registration already has it assigned
function findExistingGraphApiAccessId(appObjectId) {
  const appDetails = JSON.parse(executeCommand(`az ad app show --id ${appObjectId} --output json`));
  const hasAccess = (appDetails.requiredResourceAccess || []).some((r) => r.resourceAppId === GRAPH_RESOURCE_APP_ID);
  return hasAccess ? GRAPH_RESOURCE_APP_ID : null;
}

// Checks whether a resource address is already tracked in the terraform state
function isAlreadyInState(resourceAddress) {
  try {
    const state = executeCommand("terraform state list", { cwd: terraformDir });
    return state.split("\n").includes(resourceAddress);
  } catch {
    // "terraform state list" fails when no state file exists yet
    return false;
  }
}

// Imports a pre-existing Azure AD resource into terraform state so apply won't recreate it
function importIfExists(resourceAddress, displayName, findObjectId, tenantId, formatImportId = (id) => id) {
  console.log(`\nChecking if "${displayName}" already exists...`);

  if (isAlreadyInState(resourceAddress)) {
    console.log(`  Already tracked in terraform state, skipping import`);
    return;
  }

  const objectId = findObjectId();
  if (!objectId) {
    console.log(`  Not found, terraform will create it`);
    return;
  }

  console.log(`  Found existing "${displayName}" (id: ${objectId}), importing into terraform state...`);
  try {
    runTerraform(`terraform import -var "tenant_id=${tenantId}" ${resourceAddress} "${formatImportId(objectId)}"`);
  } catch {
    // The lookup can be stale (eventual consistency) and report a match that no longer
    // exists at the remote endpoint terraform checks; fall back to letting apply create it.
    console.log(`  Import failed, letting terraform apply create/update it instead`);
  }
}

// Looks up the object ID of the well-known Microsoft Graph service principal
function findGraphServicePrincipalObjectId() {
  const sp = JSON.parse(executeCommand(`az ad sp show --id ${GRAPH_RESOURCE_APP_ID} --output json`));
  return sp.id;
}

// Grants admin consent by directly creating app role assignments on our service principal,
// bypassing "az ad app permission admin-consent" which errors when the SP already exists.
function grantAdminConsent(servicePrincipalObjectId) {
  console.log("\nGranting admin consent for API permissions...");
  const graphSpId = findGraphServicePrincipalObjectId();

  for (const roleId of GRAPH_ROLE_IDS) {
    const body = JSON.stringify({
      principalId: servicePrincipalObjectId,
      resourceId: graphSpId,
      appRoleId: roleId,
    });
    const tempFile = path.join(os.tmpdir(), `role-assignment-${Date.now()}-${roleId}.json`);
    fs.writeFileSync(tempFile, body);

    try {
      executeCommand(
        `az rest --method POST --uri "https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}/appRoleAssignments" --headers Content-Type=application/json --body @${tempFile}`,
      );
      console.log(`  ✓ Granted role ${roleId}`);
    } catch (error) {
      if (error.message.includes("Permission being assigned already exists")) {
        console.log(`  Role ${roleId} already granted, skipping`);
      } else {
        console.warn(`  ⚠ Could not grant role ${roleId}: ${error.message}`);
      }
    } finally {
      fs.unlinkSync(tempFile);
    }
  }
}

// Reads config, imports existing resources, and runs terraform init/apply
async function deployTerraform() {
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

  ensureAzureAuth(tenantId);

  console.log("\nRunning terraform init...");
  runTerraform("terraform init");

  const appObjectId = findExistingAppObjectId();
  importIfExists(
    "azuread_application.access_pass_backend",
    APP_DISPLAY_NAME,
    () => appObjectId,
    tenantId,
    (id) => `/applications/${id}`,
  );

  const existingClientId = appObjectId ? findAppClientId(appObjectId) : null;
  importIfExists(
    "azuread_service_principal.access_pass_backend",
    "Service principal",
    () => (existingClientId ? findExistingServicePrincipalObjectId(existingClientId) : null),
    tenantId,
    (id) => `/servicePrincipals/${id}`,
  );

  importIfExists(
    "azuread_application_api_access.msgraph",
    "Microsoft Graph API access",
    () => (appObjectId ? findExistingGraphApiAccessId(appObjectId) : null),
    tenantId,
    () => `/applications/${appObjectId}/apiAccess/${GRAPH_RESOURCE_APP_ID}`,
  );

  importIfExists(
    "azuread_group.pass_reset_managers",
    GROUP_DISPLAY_NAME,
    findExistingGroupObjectId,
    tenantId,
    (id) => `/groups/${id}`,
  );
  importIfExists(
    "azuread_administrative_unit.pass_reset_targets",
    ADMIN_UNIT_DISPLAY_NAME,
    findExistingAdministrativeUnitObjectId,
    tenantId,
    (id) => `/directory/administrativeUnits/${id}`,
  );

  console.log("\nRunning terraform apply...");
  runTerraform(`terraform apply -var "tenant_id=${tenantId}"`);

  const servicePrincipalObjectId = executeCommand("terraform output -raw service_principal_object_id", {
    cwd: terraformDir,
  });
  grantAdminConsent(servicePrincipalObjectId);

  console.log("\n✓ Terraform apply completed successfully!");
}

// Main execution
deployTerraform().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
