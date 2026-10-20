/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { getSubscriptionId } from "../util/azureCli.cjs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { setTfVar } from "./tfUtils.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const env = {
  // please don't modify data, path and loaded directly
  data: null,
  path: null,
  loaded: false,

  loadFromFile(filePath) {
    this.path = filePath;
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf8");
      this.data = dotenv.parse(content);
      this.loaded = true;
    } else {
      // or should we throw error here?
      this.data = {}; // If file does not exist, initialize with empty object
      this.loaded = true;
    }
  },

  ensureLoaded() {
    if (!this.loaded) {
      throw new Error("Env file has not been loaded. Call load() first.");
    }
  },

  get(key, defaultValue = undefined) {
    this.ensureLoaded();
    return this.data[key] ?? defaultValue;
  },

  set(key, value) {
    this.ensureLoaded();
    this.data[key] = String(value);
  },

  add(key, value) {
    this.ensureLoaded();

    if (key in this.data) {
      throw new Error(`ENV key "${key}" already exists`);
    }
    this.data[key] = String(value);
  },

  edit(key, value) {
    this.ensureLoaded();

    if (!(key in this.data)) {
      throw new Error(`ENV key "${key}" does not exist`);
    }
    this.data[key] = String(value);
  },

  delete(key) {
    this.ensureLoaded();
    delete this.data[key];
  },

  saveToFile() {
    this.ensureLoaded();

    if (!this.path) {
      throw new Error("Env file path is not set");
    }

    const content =
      "# if there is no subscription ID, which means no existing subscription, the script will create a new subscription under the billing account provided during c01(bootstrap) stage.\n" +
      Object.entries(this.data)
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    writeFileSync(this.path, content);
  },
};

function main(corpEnvFile) {
  const autoApprove = process.argv.includes("--auto-approve");

  try {
    // Find the working directory
    const workingDirName = resolve(__dirname, "c02globalGroups");
    if (!workingDirName) {
      throw new Error(`c02globalGroups directory not found in ${__dirname}`);
    }
    console.log("workingDir:", workingDirName);
    if (!existsSync(corpEnvFile)) {
      throw new Error("corp.env file not found.");
    }
    env.loadFromFile(corpEnvFile);
    const corpName = env.get("NAME");
    if (!corpName) {
      throw new Error("NAME is not set in corp.env.");
    }
    let tfStateList = [];
    try {
      console.log("Loading existing terraform state in :", workingDirName);
      tfStateList = execSync("terraform state list", { cwd: resolve(__dirname, workingDirName), encoding: "utf8", stdio: "pipe" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {}
    console.log("tfStateList:", tfStateList);
    // TODO: need Groups Administrator role to run!!!
    // Always prefer the subscription created/persisted by c01 in corp.env.
    let subscriptionId = env.get("SUBSCRIPTION_ID") ?? getSubscriptionId();
    if (!subscriptionId) {
      throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
    }

    try {
      execSync(`az account show --subscription ${subscriptionId} --query id -o tsv`, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
      }).trim();
      execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
    } catch (_) {
      throw new Error(
        `SUBSCRIPTION_ID (${subscriptionId}) from corp.env is not available in the current Azure CLI context. ` +
          "Run 'az login' with the correct tenant/account, then 'az account set --subscription <SUBSCRIPTION_ID>', and retry stage c02."
      );
    }

    setTfVar("subscription_id", subscriptionId);
    execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });
    let rgDeployerId, leadDevId, dbAdminDevId, dbAdminTestId, dbAdminProdId;
    try {
      rgDeployerId = execSync(`az ad group show --group "ResourceGroupDeployer" --query id -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    } catch (_) {
      rgDeployerId = null;
    }
    try {
      leadDevId = execSync(`az ad group show --group "LeadDeveloper" --query id -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    } catch (_) {
      leadDevId = null;
    }
    try {
      dbAdminDevId = execSync(`az ad group show --group "DbAdmin-Dev" --query id -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    } catch (_) {
      dbAdminDevId = null;
    }
    try {
      dbAdminTestId = execSync(`az ad group show --group "DbAdmin-Test" --query id -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    } catch (_) {
      dbAdminTestId = null;
    }
    try {
      dbAdminProdId = execSync(`az ad group show --group "DbAdmin-Prod" --query id -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    } catch (_) {
      dbAdminProdId = null;
    }
    if (rgDeployerId && !tfStateList.includes("azuread_group.resource_group_deployer")) {
      console.log("Importing existing ResourceGroupDeployer group with ID:", rgDeployerId);
      execSync(`terraform import azuread_group.resource_group_deployer /groups/${rgDeployerId}`, {
        stdio: "pipe",
        shell: true,
        cwd: resolve(__dirname, workingDirName),
      });
      if (!tfStateList.includes("azurerm_role_assignment.resource_group_deployer_owner")) {
        const ownerRoleAssignmentId = execSync(
          `az role assignment list --assignee "${rgDeployerId}" --role "Owner" --scope /subscriptions/${subscriptionId} --query "[0].id" -o tsv`,
          { encoding: "utf8" }
        ).trim();
        if (ownerRoleAssignmentId) {
          console.log("Importing existing ResourceGroupDeployer Owner role assignment.");
          execSync(`terraform import azurerm_role_assignment.resource_group_deployer_owner ${ownerRoleAssignmentId}`, {
            stdio: "pipe",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        }
      }
    }
    if (leadDevId && !tfStateList.includes("azuread_group.lead_developer")) {
      console.log("Importing existing LeadDeveloper group with ID:", leadDevId);
      execSync(`terraform import azuread_group.lead_developer /groups/${leadDevId}`, {
        stdio: "pipe",
        shell: true,
        cwd: resolve(__dirname, workingDirName),
      });

      if (rgDeployerId && !tfStateList.includes("azuread_group_member.lead_developer_member")) {
        const isMember =
          execSync(`az ad group member check --group "ResourceGroupDeployer" --member-id ${leadDevId} --query value -o tsv`, {
            encoding: "utf8",
          }).trim() === "true";
        if (isMember) {
          console.log("Importing existing LeadDeveloper membership in ResourceGroupDeployer group.");
          execSync(`terraform import azuread_group_member.lead_developer_member "${rgDeployerId}/member/${leadDevId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        }
      }
    }
    if (dbAdminDevId && !tfStateList.includes("azuread_group.db_admin_dev")) {
      console.log("Importing existing DbAdmin-Dev group with ID:", dbAdminDevId);
      execSync(`terraform import azuread_group.db_admin_dev /groups/${dbAdminDevId}`, {
        stdio: "pipe",
        shell: true,
        cwd: resolve(__dirname, workingDirName),
      });
      if (rgDeployerId && !tfStateList.includes("azuread_group_member.db_admin_dev_member")) {
        const hasMember =
          execSync(`az ad group member check --group "DbAdmin-Dev" --member-id ${rgDeployerId} --query value -o tsv`, {
            encoding: "utf8",
          }).trim() === "true";
        if (hasMember) {
          console.log("Importing existing ResourceGroupDeployer membership in DbAdmin-Dev group.");
          execSync(`terraform import azuread_group_member.db_admin_dev_member "${dbAdminDevId}/member/${rgDeployerId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        }
      }
    }
    if (dbAdminTestId && !tfStateList.includes("azuread_group.db_admin_test")) {
      console.log("Importing existing DbAdmin-Test group with ID:", dbAdminTestId);
      execSync(`terraform import azuread_group.db_admin_test /groups/${dbAdminTestId}`, {
        stdio: "pipe",
        shell: true,
        cwd: resolve(__dirname, workingDirName),
      });
      if (rgDeployerId && !tfStateList.includes("azuread_group_member.db_admin_test_member")) {
        const hasMember =
          execSync(`az ad group member check --group "DbAdmin-Test" --member-id ${rgDeployerId} --query value -o tsv`, {
            encoding: "utf8",
          }).trim() === "true";
        if (hasMember) {
          console.log("Importing existing ResourceGroupDeployer membership in DbAdmin-Test group.");
          execSync(`terraform import azuread_group_member.db_admin_test_member "${dbAdminTestId}/member/${rgDeployerId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        }
      }
    }
    if (dbAdminProdId && !tfStateList.includes("azuread_group.db_admin_prod")) {
      console.log("Importing existing DbAdmin-Prod group with ID:", dbAdminProdId);
      execSync(`terraform import azuread_group.db_admin_prod /groups/${dbAdminProdId}`, {
        stdio: "pipe",
        shell: true,
        cwd: resolve(__dirname, workingDirName),
      });
      if (rgDeployerId && !tfStateList.includes("azuread_group_member.db_admin_prod_member")) {
        const hasMember =
          execSync(`az ad group member check --group "DbAdmin-Prod" --member-id ${rgDeployerId} --query value -o tsv`, {
            encoding: "utf8",
          }).trim() === "true";
        if (hasMember) {
          console.log("Importing existing ResourceGroupDeployer membership in DbAdmin-Prod group.");
          execSync(`terraform import azuread_group_member.db_admin_prod_member "${dbAdminProdId}/member/${rgDeployerId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        }
      }
    }
    // console.log("Starting Terraform initialization.");
    // // Run terraform
    // execSync(`terraform apply ${autoApprove ? " -auto-approve" : ""}`, {
    //   stdio: "inherit",
    //   shell: true,
    //   cwd: resolve(__dirname, workingDirName),
    // });
    // if (!env.get("SUBSCRIPTION_ID")) {
    //   const newSubscriptionId = execSync(`terraform output -raw new_subscription_id`, {
    //     encoding: "utf-8",
    //     cwd: resolve(__dirname, workingDirName),
    //   }).trim();
    //   env.add("SUBSCRIPTION_ID", newSubscriptionId);
    //   env.saveToFile();
    // }
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
}

export { main };
