/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execFileSync, execSync } from "child_process";
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
    // Find the working directory that matches the stage
    const workingDirName = resolve(__dirname, "c20awsentrasso");
    if (!workingDirName) {
      throw new Error(`c20awsentrasso directory not found in ${__dirname}`);
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

    const appName = env.get("APP_NAME") || "AWS Admin Console";
    setTfVar("app_name", appName);

    // create sso for aws account

    console.log("Starting Terraform initialization.");
    execSync(`terraform init`, { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) });

    // Fetch existing app registration info (used for all imports below)
    let appObjectId = null;
    let appClientId = null;
    try {
      const appJson = execSync(`az ad app list --display-name "${appName}" --query "[0].{id:id,appId:appId}" -o json`, {
        encoding: "utf8",
        stdio: "pipe",
        shell: true,
      }).trim();
      const app = JSON.parse(appJson || "{}");
      if (app?.id) {
        appObjectId = app.id;
        appClientId = app.appId;
      }
    } catch {
      /* ignore */
    }

    if (appObjectId && appClientId) {
      let spObjectId = null;
      try {
        spObjectId =
          execSync(`az ad sp show --id ${appClientId} --query id -o tsv`, {
            encoding: "utf8",
            stdio: "pipe",
            shell: true,
          }).trim() || null;
      } catch {
        /* ignore */
      }

      if (spObjectId) {
        if (!tfStateList.includes("azuread_application_from_template.aws_sso_corp")) {
          // Get the gallery template ID used to create this app
          let templateId = null;
          try {
            templateId =
              execSync(`az ad app show --id ${appObjectId} --query applicationTemplateId -o tsv`, {
                encoding: "utf8",
                stdio: "pipe",
                shell: true,
              }).trim() || null;
          } catch {
            /* ignore */
          }

          if (templateId) {
            console.log("Importing azuread_application_from_template.aws_sso_corp");
            try {
              execSync(
                `terraform import azuread_application_from_template.aws_sso_corp "/applicationTemplates/${templateId}/instantiate/${appObjectId}/${spObjectId}"`,
                { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) }
              );
            } catch (err) {
              console.warn("Import azuread_application_from_template.aws_sso_corp failed:", err.message);
            }
          }
        }

        if (!tfStateList.includes("azuread_service_principal.aws_sso_corp")) {
          console.log("Importing azuread_service_principal.aws_sso_corp");
          try {
            execSync(`terraform import azuread_service_principal.aws_sso_corp "/servicePrincipals/${spObjectId}"`, {
              stdio: "pipe",
              shell: true,
              cwd: resolve(__dirname, workingDirName),
            });
          } catch (err) {
            console.warn("Import azuread_service_principal.aws_sso_corp failed:", err.message);
          }
        }

        if (!tfStateList.includes("azuread_service_principal_token_signing_certificate.aws_sso_corp")) {
          let keyId = null;
          try {
            keyId =
              execSync(`az ad sp show --id ${spObjectId} --query "keyCredentials[?usage=='Sign'][0].keyId" -o tsv`, {
                encoding: "utf8",
                stdio: "pipe",
                shell: true,
              }).trim() || null;
          } catch {
            /* ignore */
          }
          if (keyId) {
            console.log("Importing azuread_service_principal_token_signing_certificate.aws_sso_corp");
            try {
              execSync(
                `terraform import azuread_service_principal_token_signing_certificate.aws_sso_corp "/servicePrincipals/${spObjectId}/keyCredentials/${keyId}"`,
                { stdio: "pipe", shell: true, cwd: resolve(__dirname, workingDirName) }
              );
            } catch (err) {
              console.warn("Import azuread_service_principal_token_signing_certificate.aws_sso_corp failed:", err.message);
            }
          }
        }

        if (!tfStateList.includes("azuread_application_identifier_uri.aws_sso_corp")) {
          const identifierUri = `https://signin.aws.amazon.com/saml#${appObjectId}`;
          let isExisting = false;
          try {
            const uris = JSON.parse(
              execSync(`az ad app show --id ${appObjectId} --query identifierUris -o json`, {
                encoding: "utf8",
                stdio: "pipe",
                shell: true,
              }).trim() || "[]"
            );
            isExisting = uris.includes(identifierUri);
          } catch {
            /* ignore */
          }
          if (isExisting) {
            const encodedUri = Buffer.from(identifierUri).toString("base64");
            console.log("Importing azuread_application_identifier_uri.aws_sso_corp");
            try {
              execSync(`terraform import azuread_application_identifier_uri.aws_sso_corp "/applications/${appObjectId}/identifierUris/${encodedUri}"`, {
                stdio: "pipe",
                shell: true,
                cwd: resolve(__dirname, workingDirName),
              });
            } catch (err) {
              console.warn("Import azuread_application_identifier_uri.aws_sso_corp failed:", err.message);
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

export function manual_message() {
  console.log("\n=== Enterprise SSO creation finished ===");
  console.log("\n=== Make sure to assign a user or a group to the Enterprise App ===");
}

export function c20_post_apply_saml_save(terraformCwd) {
  try {
    console.log("Waiting 15 seconds before refreshing SAML metadata...");
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000);

    const tenantId = execSync("az account show --query tenantId -o tsv", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    }).trim();

    const appState = execSync("terraform state show data.azuread_application.aws_sso_corp", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    });

    const appTemplateState = execSync("terraform state show azuread_application_from_template.aws_sso_corp", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    });

    const samlProviderState = execSync("terraform state show aws_iam_saml_provider.entra_c", {
      cwd: terraformCwd,
      encoding: "utf8",
      stdio: "pipe",
      shell: true,
    });

    const clientIdMatch = appState.match(/^\s*client_id\s*=\s*"([^"]+)"/m);
    const samlArnMatch = samlProviderState.match(/^\s*arn\s*=\s*"([^"]+)"/m);
    const servicePrincipalObjectIdMatch = appTemplateState.match(/^\s*service_principal_object_id\s*=\s*"([^"]+)"/m);

    const clientId = clientIdMatch?.[1];
    const samlProviderArn = samlArnMatch?.[1];
    const servicePrincipalObjectId = servicePrincipalObjectIdMatch?.[1];

    if (!clientId || !samlProviderArn || !servicePrincipalObjectId) {
      throw new Error("Could not resolve client_id, SAML provider ARN, or service principal object id from terraform state.");
    }

    const servicePrincipalRaw = execSync(
      `az rest --method GET --url https://graph.microsoft.com/v1.0/servicePrincipals/${servicePrincipalObjectId}?$select=preferredTokenSigningKeyThumbprint`,
      {
        cwd: terraformCwd,
        encoding: "utf8",
        stdio: "pipe",
        shell: true,
      }
    );
    const servicePrincipal = JSON.parse(servicePrincipalRaw || "{}");
    const expectedSigningThumbprint = (servicePrincipal.preferredTokenSigningKeyThumbprint || "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();

    const federationMetadataUrl = `https://login.microsoftonline.com/${tenantId}/federationmetadata/2007-06/federationmetadata.xml?appid=${clientId}`;

    console.log("Refreshing AWS SAML provider metadata from Entra federation metadata...");

    execFileSync("node", [resolve(terraformCwd, "wait_metadata_ready.mjs")], {
      cwd: terraformCwd,
      stdio: "inherit",
      env: {
        ...process.env,
        FEDERATION_METADATA_URL: federationMetadataUrl,
        SAML_PROVIDER_ARN: samlProviderArn,
        METADATA_PATH: resolve(terraformCwd, "federationmetadata.xml"),
        MAX_RETRIES: "40",
        RETRY_DELAY_SECONDS: "5",
        MIN_SIGNING_CERTS: "1",
        EXPECTED_SIGNING_THUMBPRINT: expectedSigningThumbprint,
      },
    });
  } catch (error) {
    console.warn("Post-apply SAML metadata refresh skipped:", error.message);
  }
}

export { main };
