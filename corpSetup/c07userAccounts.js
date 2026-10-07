/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { existsSync, readFileSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { setTfVar } from "./tfUtils.js";
import { getResourceGroupName } from "../util/namingConvention.cjs";

// ESM-compatible path resolution for this script's directory.
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// wraps each value in quotes and escapes inner quotes.
function csvEscape(value) {
  const str = value == null ? "" : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

// reads terraform output and writes created_users.csv.
function exportCreatedUsersCsv(workingDirName) {
  // Step A: Read Terraform output for created users as JSON.
  const outputJson = execSync("terraform output -json created_users", {
    encoding: "utf8",
    shell: true,
    cwd: workingDirName,
  }).trim();

  // Build CSV rows with username, UPN, and object id.
  const createdUsers = JSON.parse(outputJson);
  const header = ["username", "user_principal_name", "object_id"].join(",");
  const rows = Object.entries(createdUsers).map(([username, details]) => {
    return [username, details.user_principal_name, details.object_id].map(csvEscape).join(",");
  });

  // Write CSV to the c07 Terraform folder.
  const csvPath = resolve(workingDirName, "created_users.csv");
  writeFileSync(csvPath, [header, ...rows].join("\n"), "utf8");
  console.log(`created_users.csv written to: ${csvPath}`);
}

// Lightweight .env reader used by this stage script.
const env = {
  data: null,
  path: null,
  loaded: false,

  // Reads corp.env from disk and stores values in memory.
  loadFromFile(filePath) {
    this.path = filePath;
    if (!existsSync(filePath)) {
      throw new Error(`corp.env file not found at ${filePath}`);
    }

    const content = readFileSync(filePath, "utf8");
    this.data = dotenv.parse(content);
    this.loaded = true;
  },

  // Returns a key from loaded env data, with optional default fallback.
  get(key, defaultValue = undefined) {
    return this.data[key] ?? defaultValue;
  },
};

// Entry point for c07 setup: validate env values and set Terraform TF_VARs.
// Flow: validate paths -> load env -> check required keys -> set TF_VAR_domain.
function main(corpEnvFile) {
  const planOnly = process.argv.includes("--planOnly");
  const autoApprove = process.argv.includes("--auto-approve");

  // Step 1: Resolve the Terraform working folder for this stage.
  const workingDirName = resolve(__dirname, "c07userAccounts");

  if (!workingDirName) {
    throw new Error(`c07userAccounts directory not found in ${__dirname}`);
  }
  // Step 2: Ensure corp.env exists, then load it.
  if (!existsSync(corpEnvFile)) {
    throw new Error("corp.env file not found.");
  }

  env.loadFromFile(corpEnvFile);
  // Step 3: Ensure required values are present in corp.env.
  const subscriptionId = env.get("SUBSCRIPTION_ID");
  if (!subscriptionId) {
    throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
  }
  // DNS is used for Terraform variable `domain` via TF_VAR_dns_name.
  const dnsName = env.get("DNS");
  if (!dnsName) {
    throw new Error("DNS is not set in corp.env.");
  }

  const corpName = env.get("NAME");
  if (!corpName) {
    throw new Error("NAME is not set in corp.env.");
  }

  // const clientId = env.get("client_id");
  // const clientSecret = env.get("client_secret");
  // const tenantId = env.get("tenant_id");
  // if (!clientId || !clientSecret || !tenantId) {
  //   throw new Error("client_id, client_secret, and tenant_id must be set in corp.env.");
  // }

  const resourceGroupName = getResourceGroupName("root", corpName);

  // Step 4: Export Terraform variables for downstream terraform commands.
  setTfVar("subscription_id", subscriptionId);
  setTfVar("dns_name", dnsName);
  setTfVar("resource_group_name", resourceGroupName);
  // setTfVar("client_id", clientId);
  // setTfVar("client_secret", clientSecret);
  // setTfVar("tenant_id", tenantId);
  // setTfVar("domain", dnsName);

  console.log("workingDir:", workingDirName);
  console.log("subscription_id:", subscriptionId);
  console.log("dns_name:", dnsName);
  console.log("resource_group_name:", resourceGroupName);
  // console.log("client_id:", clientId);
  //console.log("client_secret:", clientSecret);
  // console.log("tenant_id:", tenantId);

  // Step 5: Initialize Terraform for c07userAccounts.
  execSync("terraform init", { stdio: "inherit", shell: true, cwd: workingDirName });

  // Step 6: Plan or apply resources.
  if (planOnly) {
    console.log("Planning Terraform changes to tfplan");
    execSync(`terraform plan -out=tfplan`, {
      stdio: "inherit",
      shell: true,
      cwd: resolve(__dirname, workingDirName),
    });
  } else {
    console.log("Applying Terraform changes.");
    // Run terraform
    execSync(`terraform apply ${autoApprove ? " -auto-approve" : ""}`, {
      stdio: "inherit",
      shell: true,
      cwd: resolve(__dirname, workingDirName),
    });
    // Step 7: Export users and generated passwords to CSV.
    exportCreatedUsersCsv(workingDirName);
  }

  // Users and generated passwords are create-only inputs; stop managing them.
  try {
    execSync("terraform state rm azuread_user.users", {
      stdio: "pipe",
      shell: true,
      cwd: workingDirName,
    });
  } catch {}

  try {
    execSync("terraform state rm random_password.user_passwords", {
      stdio: "pipe",
      shell: true,
      cwd: workingDirName,
    });
  } catch {}

  return subscriptionId;
}

export { main };
