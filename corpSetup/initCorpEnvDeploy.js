/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

//Execute with: node initCorpEnvDeploy.js --dir SubscriptionBudget

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve, dirname } from "path";
import { getDefaultAzureLocation } from "../util/azureCli.cjs";
import minimist from "minimist";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { main as c01function } from "./SubscriptionBudget/run.js";
import { main as c02function } from "./GlobalGroups/run.js";
import { main as c05function } from "./RootRg/run.js";
import { main as c07function } from "./UserAccounts/run.js";
import { main as c20function, manual_message, c20_post_apply_saml_save } from "./AwsEntraSso/run.js";
import { main as c21function } from "./AwsEntraSsoP2/run.js";
import { main as c25function } from "./CloudFront/run.js";

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

let azureLocation = null;
function getAzureLocation() {
  if (azureLocation) {
    return azureLocation;
  }
  try {
    const tmpazureLocation = getDefaultAzureLocation();
    if (tmpazureLocation && tmpazureLocation.length > 0) {
      return (azureLocation = tmpazureLocation);
    }
  } catch (error) {
    console.error("Failed to get Azure location:", error.message);
  }
  azureLocation = "australiaeast"; // Default fallback location
  console.warn(`Using fallback Azure location: ${azureLocation}`);
  return azureLocation;
}

function main() {
  const autoApprove = process.argv.includes("--auto-approve");
  const args = minimist(process.argv.slice(2));
  const dir = args.dir;
  const planOnly = process.argv.includes("--planOnly");
  const stageDirs = () => readdirSync(__dirname, { withFileTypes: true }).filter((e) => e.isDirectory());

  try {
    if (!dir) {
      throw new Error("--dir is required.");
    }
    // --dir names the directory outright. Matched against the real listing rather than joined
    // onto a path, so it cannot be pointed outside corpSetup.
    const workingDirName = stageDirs().find((e) => e.name === dir)?.name;
    if (!workingDirName) {
      throw new Error(`No such stage directory: ${dir}`);
    }
    console.log("workingDir:", workingDirName);
    const corpEnvFile = resolve(__dirname, "corp.env");
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
    switch (workingDirName) {
      case "SubscriptionBudget": {
        c01function(corpEnvFile);
        break;
      }
      case "GlobalGroups": {
        // need Groups Administrator role to run this stage
        c02function(corpEnvFile);
        break;
      }
      case "RootRg": {
        c05function(corpEnvFile);
        break;
      }
      case "UserAccounts": {
        c07function(corpEnvFile);
        break;
      }
      case "AwsEntraSso": {
        c20function(corpEnvFile);
        break;
      }
      case "AwsEntraSsoP2": {
        c21function(corpEnvFile);
        break;
      }
      case "CloudFront": {
        c25function(corpEnvFile);
        break;
      }
    }

    // c07 handles its own terraform lifecycle (init/plan/apply/export).
    if (workingDirName === "UserAccounts") {
      return;
    }

    if (planOnly) {
      console.log("Planning Terraform changes to tfplan");
      execSync(`terraform plan -lock=false -out=tfplan`, {
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

      // // Post-apply SAML configuration for AwsEntraSso
      // if (workingDirName === "AwsEntraSso") {
      //   manual_message();
      // }

      if (!env.get("SUBSCRIPTION_ID")) {
        try {
          const newSubscriptionId = execSync(`terraform output -raw new_subscription_id`, {
            encoding: "utf-8",
            cwd: resolve(__dirname, workingDirName),
          }).trim();

          if (!newSubscriptionId) throw new Error("new_subscription_id is empty");

          env.add("SUBSCRIPTION_ID", newSubscriptionId);
          env.saveToFile();
        } catch (err) {
          console.warn("Failed to get new_subscription_id from Terraform:", err.message);
        }
      }
    }
  } catch (error) {
    console.error(error.stack);
    process.exit(1);
  }
}

main();

export default { main };
