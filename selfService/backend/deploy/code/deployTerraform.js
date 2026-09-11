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

import { spawnSync } from "child_process";
import fs from "fs";
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

// Runs an Azure CLI command and returns its trimmed output
// Todo: Test on mac
function runAzureCli(args) {
  const isWindows = process.platform === "win32";
  const executable = isWindows ? process.env.ComSpec || "cmd.exe" : "az";
  const commandArgs = isWindows ? ["/d", "/s", "/c", "az.cmd", ...args] : args;
  const result = spawnSync(executable, commandArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `Azure CLI exited with code ${result.status}`);
  }

  return result.stdout.trim();
}

// Runs a Terraform command with optional output capture and failure handling
function runTerraform(args, { captureOutput = false, allowFailure = false } = {}) {
  const result = spawnSync("terraform", args, {
    cwd: terraformDir,
    encoding: "utf8",
    stdio: captureOutput ? ["ignore", "pipe", "pipe"] : "inherit",
    shell: false,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !allowFailure) {
    const detail = captureOutput ? result.stderr.trim() : "";
    throw new Error(detail || `Terraform exited with code ${result.status}`);
  }

  return result.status === 0 ? (result.stdout || "").trim() : null;
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
  const accountInfo = JSON.parse(runAzureCli(["account", "show", "--output", "json"]));
  console.log(`Currently authenticated to tenant: ${accountInfo.tenantId}`);

  if (accountInfo.tenantId !== tenantId) {
    console.log(`Switching to target tenant ${tenantId}...`);
    runAzureCli(["login", "--tenant", tenantId, "--allow-no-subscriptions", "--output", "none"]);
  }
}

// Looks up the object ID of an existing app registration by display name, if any
function findExistingAppObjectId() {
  const apps = JSON.parse(
    runAzureCli(["ad", "app", "list", "--filter", `displayName eq '${APP_DISPLAY_NAME}'`, "--output", "json"]),
  );
  return apps?.[0]?.id ?? null;
}

// Looks up the object ID of an existing group by display name, if any
function findExistingGroupObjectId() {
  const groups = JSON.parse(
    runAzureCli(["ad", "group", "list", "--filter", `displayName eq '${GROUP_DISPLAY_NAME}'`, "--output", "json"]),
  );
  return groups?.[0]?.id ?? null;
}

// Looks up the object ID of an existing administrative unit by display name, if any
function findExistingAdministrativeUnitObjectId() {
  const uri = `https://graph.microsoft.com/v1.0/directory/administrativeUnits?$filter=displayName eq '${ADMIN_UNIT_DISPLAY_NAME}'`;
  const result = JSON.parse(runAzureCli(["rest", "--method", "GET", "--uri", uri, "--output", "json"]));
  return result?.value?.[0]?.id ?? null;
}

// Looks up the client (application) ID of an app registration from its object ID
function findAppClientId(appObjectId) {
  const appDetails = JSON.parse(runAzureCli(["ad", "app", "show", "--id", appObjectId, "--output", "json"]));
  return appDetails?.appId ?? null;
}

// Looks up the object ID of an existing service principal for the given client ID, if any
function findExistingServicePrincipalObjectId(clientId) {
  const servicePrincipals = JSON.parse(
    runAzureCli(["ad", "sp", "list", "--filter", `appId eq '${clientId}'`, "--output", "json"]),
  );
  return servicePrincipals?.[0]?.id ?? null;
}

// Returns the Microsoft Graph resource app ID if the app registration already has it assigned
function findExistingGraphApiAccessId(appObjectId) {
  const appDetails = JSON.parse(runAzureCli(["ad", "app", "show", "--id", appObjectId, "--output", "json"]));
  const hasAccess = (appDetails.requiredResourceAccess || []).some((r) => r.resourceAppId === GRAPH_RESOURCE_APP_ID);
  return hasAccess ? GRAPH_RESOURCE_APP_ID : null;
}

// Looks up the object ID of the Microsoft Graph service principal
function findGraphServicePrincipalObjectId() {
  const servicePrincipal = JSON.parse(
    runAzureCli(["ad", "sp", "show", "--id", GRAPH_RESOURCE_APP_ID, "--output", "json"]),
  );
  return servicePrincipal.id;
}

// Finds existing Microsoft Graph app role assignments for the application service principal
function findExistingAppRoleAssignments(servicePrincipalObjectId, graphServicePrincipalObjectId) {
  if (!servicePrincipalObjectId) {
    return new Map();
  }

  const uri = `https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}/appRoleAssignments?$select=id,appRoleId,resourceId`;
  const result = JSON.parse(runAzureCli(["rest", "--method", "GET", "--uri", uri, "--output", "json"]));
  return new Map(
    (result.value || [])
      .filter((assignment) => assignment.resourceId === graphServicePrincipalObjectId)
      .map((assignment) => [assignment.appRoleId, assignment.id]),
  );
}

// Checks whether a resource address is already tracked in the terraform state
function isAlreadyInState(resourceAddress) {
  return (
    runTerraform(["state", "show", "-no-color", resourceAddress], {
      captureOutput: true,
      allowFailure: true,
    }) !== null
  );
}

// Imports a pre-existing Azure AD resource into terraform state so apply won't recreate it
function importIfExists(resourceAddress, displayName, objectId, tenantId, formatImportId = (id) => id) {
  console.log(`\nChecking if "${displayName}" already exists...`);

  if (isAlreadyInState(resourceAddress)) {
    console.log(`  Already tracked in terraform state, skipping import`);
    return;
  }

  if (!objectId) {
    console.log(`  Not found, terraform will create it`);
    return;
  }

  console.log(`  Found existing "${displayName}" (id: ${objectId}), importing into terraform state...`);
  runTerraform(["import", "-input=false", `-var=tenant_id=${tenantId}`, resourceAddress, formatImportId(objectId)]);
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
  runTerraform(["init", "-input=false"]);

  const appObjectId = findExistingAppObjectId();
  importIfExists(
    "azuread_application.access_pass_backend",
    APP_DISPLAY_NAME,
    appObjectId,
    tenantId,
    (id) => `/applications/${id}`,
  );

  const existingClientId = appObjectId ? findAppClientId(appObjectId) : null;
  const servicePrincipalObjectId = existingClientId ? findExistingServicePrincipalObjectId(existingClientId) : null;
  importIfExists(
    "azuread_service_principal.access_pass_backend",
    "Service principal",
    servicePrincipalObjectId,
    tenantId,
    (id) => `/servicePrincipals/${id}`,
  );

  importIfExists(
    "azuread_application_api_access.msgraph",
    "Microsoft Graph API access",
    appObjectId ? findExistingGraphApiAccessId(appObjectId) : null,
    tenantId,
    () => `/applications/${appObjectId}/apiAccess/${GRAPH_RESOURCE_APP_ID}`,
  );

  importIfExists(
    "azuread_group.pass_reset_managers",
    GROUP_DISPLAY_NAME,
    findExistingGroupObjectId(),
    tenantId,
    (id) => `/groups/${id}`,
  );
  importIfExists(
    "azuread_administrative_unit.pass_reset_targets",
    ADMIN_UNIT_DISPLAY_NAME,
    findExistingAdministrativeUnitObjectId(),
    tenantId,
    (id) => `/directory/administrativeUnits/${id}`,
  );

  const graphServicePrincipalObjectId = findGraphServicePrincipalObjectId();
  const appRoleAssignments = findExistingAppRoleAssignments(servicePrincipalObjectId, graphServicePrincipalObjectId);
  const roleResources = [
    [
      "azuread_app_role_assignment.group_member_read_write_all",
      "GroupMember.ReadWrite.All admin consent",
      GRAPH_ROLE_IDS[0],
    ],
    [
      "azuread_app_role_assignment.administrative_unit_read_write_all",
      "AdministrativeUnit.ReadWrite.All admin consent",
      GRAPH_ROLE_IDS[1],
    ],
  ];

  for (const [resourceAddress, displayName, roleId] of roleResources) {
    importIfExists(
      resourceAddress,
      displayName,
      appRoleAssignments.get(roleId),
      tenantId,
      (assignmentId) => `/servicePrincipals/${graphServicePrincipalObjectId}/appRoleAssignedTo/${assignmentId}`,
    );
  }

  console.log("\nRunning terraform apply...");
  runTerraform(["apply", `-var=tenant_id=${tenantId}`]);

  console.log("\n✓ Terraform apply completed successfully!");
}

// Main execution
deployTerraform().catch((error) => {
  console.error("Error:", error.message);
  process.exit(1);
});
