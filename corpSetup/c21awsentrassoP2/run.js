/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { getSubscriptionId } from "../../util/azureCli.cjs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { setTfVar } from "../tfUtils.js";

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
    // Find the working directory that matches the stage
    const workingDirName = __dirname;
    if (!workingDirName) {
      throw new Error(`c21awsentrassoP2 directory not found in ${__dirname}`);
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
    } catch {
      /* ignore */
    }
    console.log("tfStateList:", tfStateList);

    //IMPORTANT: Need Global Administrator role active to run this code
    const subscriptionId = env.get("SUBSCRIPTION_ID");
    if (!subscriptionId) {
      throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
    }
    const tenantId = execSync(`az account show --query tenantId -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    const accSubscriptionId = getSubscriptionId();
    if (accSubscriptionId !== subscriptionId) {
      execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
      console.log("Switching subscription to", subscriptionId);
    }

    setTfVar("tenant_id", tenantId);
    setTfVar("subscription_id", subscriptionId);

    // create sso for aws account

    console.log("Starting Terraform initialization.");
    execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });

    const identityProviderName = env.get("IDENTITY_PROVIDER_NAME") || "EntraID";
    const roleName = env.get("ROLE_NAME") || "AccountAdminRole";
    const roleRoName = env.get("ROLE_RO_NAME") || "ReadOnlyRole";

    if (!tfStateList.includes("aws_iam_saml_provider.entra")) {
      let samlArn = null;
      try {
        samlArn =
          execSync(`aws iam list-saml-providers --query "SAMLProviderList[?contains(Arn, '/${identityProviderName}')].Arn" -o text`, {
            encoding: "utf8",
            stdio: "pipe",
            shell: true,
          }).trim() || null;
      } catch {
        /* ignore */
      }
      if (samlArn) {
        console.log("Importing aws_iam_saml_provider.entra");
        try {
          execSync(`terraform import aws_iam_saml_provider.entra "${samlArn}"`, {
            stdio: "inherit",
            shell: true,
            cwd: resolve(__dirname, workingDirName),
          });
        } catch (err) {
          console.warn("Import aws_iam_saml_provider.entra failed:", err.message);
        }
      }
    }

    for (const [tfResource, iamRoleName, policyArn] of [
      ["aws_iam_role.entra_id_admin_access", roleName, "arn:aws:iam::aws:policy/AdministratorAccess"],
      ["aws_iam_role.entra_id_read_only_access", roleRoName, "arn:aws:iam::aws:policy/ReadOnlyAccess"],
    ]) {
      let roleExists = false;
      try {
        execSync(`aws iam get-role --role-name ${iamRoleName}`, { stdio: "ignore" });
        roleExists = true;
      } catch {
        /* ignore */
      }

      if (roleExists) {
        if (!tfStateList.includes(tfResource)) {
          console.log(`Importing ${tfResource}`);
          try {
            execSync(`terraform import ${tfResource} "${iamRoleName}"`, {
              stdio: "pipe",
              shell: true,
              cwd: resolve(__dirname, workingDirName),
            });
          } catch (err) {
            console.warn(`Import ${tfResource} failed:`, err.message);
          }
        }

        const attachmentResource = tfResource.replace("aws_iam_role.", "aws_iam_role_policy_attachment.");
        if (!tfStateList.includes(attachmentResource)) {
          let isPolicyAttached = false;
          try {
            const attached = execSync(
              `aws iam list-attached-role-policies --role-name ${iamRoleName} --query "AttachedPolicies[?PolicyArn=='${policyArn}'].PolicyArn" -o text`,
              { encoding: "utf8", stdio: "pipe", shell: true }
            ).trim();
            isPolicyAttached = !!attached;
          } catch {
            /* ignore */
          }
          if (isPolicyAttached) {
            console.log(`Importing ${attachmentResource}`);
            try {
              execSync(`terraform import ${attachmentResource} "${iamRoleName}/${policyArn}"`, {
                stdio: "inherit",
                shell: true,
                cwd: resolve(__dirname, workingDirName),
              });
            } catch (err) {
              console.warn(`Import ${attachmentResource} failed:`, err.message);
            }
          }
        }
      }
    }

    // Run terraform
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
}

export { main };
