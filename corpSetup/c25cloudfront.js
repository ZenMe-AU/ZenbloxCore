/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/* This script configures the corporate environment with the relevant permissions to allow automated deployments.
 */
import { execSync } from "child_process";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import {
  getResourceGroupName,
  getStorageAccountName,
  getBucketName,
  getLambdaFunctionName,
  getCloudfrontDistributionName,
  getLambdaFunctionRoleName,
  getCloudfrontOriginAccessControlName,
  getOriginRequestPolicyName,
  getCachePolicyName,
  getResponseHeadersPolicyName,
  getAppRegistrationName,
} from "../util/namingConvention.cjs";
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
    const workingDirName = "c25cloudfront";
    const workingDirPath = resolve(__dirname, workingDirName);
    if (!workingDirPath) {
      throw new Error(`c25cloudfront directory not found in ${__dirname}`);
    }
    console.log("workingDir:", workingDirPath);
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
      console.log("Loading existing terraform state in :", workingDirPath);
      tfStateList = execSync("terraform state list", { cwd: workingDirPath, encoding: "utf8", stdio: "pipe" })
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
    } catch {
      /* ignore */
    }
    console.log("tfStateList:", tfStateList);

    const subscriptionId = env.get("SUBSCRIPTION_ID");
    if (!subscriptionId) {
      throw new Error("SUBSCRIPTION_ID is not set in corp.env.");
    }
    const bucketNameSuffix = subscriptionId.replace(/-/g, "").slice(0, 8).toLowerCase();
    const dnsName = env.get("DNS");
    if (!dnsName) {
      throw new Error("DNS is not set in corp.env.");
    }
    const tenantId = execSync(`az account show --query tenantId -o tsv`, { encoding: "utf8", stdio: "pipe" }).trim();
    const accSubscriptionId = getSubscriptionId();
    if (accSubscriptionId !== subscriptionId) {
      execSync(`az account set --subscription ${subscriptionId}`, { stdio: "pipe", shell: true });
      console.log("Switching subscription to", subscriptionId);
    }
    const resourceGroupName = getResourceGroupName("root", corpName);
    const storageAccountName = getStorageAccountName(corpName);
    try {
      execSync(`az storage account show --resource-group ${resourceGroupName} --name ${storageAccountName}`, { stdio: "ignore" });
    } catch {
      throw new Error(`Storage Account ${storageAccountName} is not found. Please run c05rootrg stage first.`);
    }
    setTfVar("tenant_id", tenantId);
    setTfVar("subscription_id", subscriptionId);
    setTfVar("dns_name", dnsName);
    setTfVar("cloudfront_alias_suffix", bucketNameSuffix);
    setTfVar("resource_group_name", resourceGroupName);
    // relative paths for TF vars (combined with path.module in main.tf locals)
    setTfVar("app_registration_name", getAppRegistrationName(corpName, "login"));
    const spaRelDir = "source/loginApp";
    const authGuardRelDir = "source/authGuardLambdaEdge";
    setTfVar("bucket_static_website_source_folder", "source/webpage");
    setTfVar("bucket_spa_source_folder", spaRelDir);
    setTfVar("lambda_edge_auth_guard_source_folder", authGuardRelDir);
    setTfVar("lambda_edge_rewrite_header_source_folder", "source/rewriteHeaderLambdaEdge");
    setTfVar("bucket_static_website_name", getBucketName(corpName, `web-${bucketNameSuffix}`));
    setTfVar("bucket_spa_name", getBucketName(corpName, `login-${bucketNameSuffix}`));
    setTfVar("lambda_edge_auth_guard_name", getLambdaFunctionName(corpName, "guard"));
    setTfVar("lambda_edge_auth_guard_role", getLambdaFunctionRoleName(corpName, "guard"));
    setTfVar("lambda_edge_rewrite_header_role", getLambdaFunctionRoleName(corpName, "rewriteHeader"));
    setTfVar("lambda_edge_rewrite_header_name", getLambdaFunctionName(corpName, "rewriteHeader"));
    setTfVar("cf_unavailable_name", getCloudfrontDistributionName(corpName, "unavailable"));
    setTfVar("cf_login_name", getCloudfrontDistributionName(corpName, "login"));
    setTfVar("cf_prod_name", getCloudfrontDistributionName(corpName, "prod"));
    setTfVar("cloudfront_oac_static_website_name", getCloudfrontOriginAccessControlName(corpName, "web"));
    setTfVar("cloudfront_oac_spa_name", getCloudfrontOriginAccessControlName(corpName, "login"));
    setTfVar("origin_request_policy_name", getOriginRequestPolicyName(corpName, "restricted"));
    const cachePolicyName = getCachePolicyName(corpName, "html-no-cache");
    const responseHeadersPolicyName = getResponseHeadersPolicyName(corpName, "HSTS");
    setTfVar("cf_cache_policy_name", cachePolicyName);
    setTfVar("cf_response_headers_policy_name", responseHeadersPolicyName);
    execSync(
      `terraform init -reconfigure\
            -backend-config="resource_group_name=${resourceGroupName}" \
            -backend-config="storage_account_name=${storageAccountName}" \
            -backend-config="container_name=terraformstate" \
            -backend-config="key=${workingDirName}.tfstate"`,
      { stdio: "pipe", shell: true, cwd: workingDirPath }
    );

    // absolute paths for pnpm build commands
    const bucketSpaSourceFolder = resolve(workingDirPath, spaRelDir);
    const lambdaEdgeAuthGuardSourceFolder = resolve(workingDirPath, authGuardRelDir);
    // install dependencies and build for SPA
    execSync(`pnpm install --ignore-workspace`, { stdio: "inherit", shell: true, cwd: bucketSpaSourceFolder });
    execSync(`pnpm run build`, { stdio: "inherit", shell: true, cwd: bucketSpaSourceFolder });
    // install dependencies and build for lambda@edge
    execSync(`pnpm install --ignore-workspace`, { stdio: "inherit", shell: true, cwd: lambdaEdgeAuthGuardSourceFolder });
    execSync(`pnpm run build`, { stdio: "inherit", shell: true, cwd: lambdaEdgeAuthGuardSourceFolder });
    // rewriteHeaderLambdaEdge has no build step — terraform archive_file zips it directly

    // import existing ACM certificate (cf) — must be in state before plan so domain_validation_options is known
    if (!tfStateList.includes("aws_acm_certificate.cf")) {
      let cfCertArn = null;
      try {
        cfCertArn =
          execSync(`aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='${dnsName}'].CertificateArn" --output text`, {
            encoding: "utf8",
            stdio: "pipe",
            shell: true,
          }).trim() || null;
      } catch {
        /* ignore */
      }
      if (cfCertArn) {
        console.log("Importing aws_acm_certificate.cf");
        try {
          execSync(`terraform import aws_acm_certificate.cf "${cfCertArn}"`, {
            stdio: "pipe",
            shell: true,
            cwd: workingDirPath,
          });
        } catch (err) {
          console.warn("Import aws_acm_certificate.cf failed:", err.message);
        }
      }
    }

    // import existing ACM certificate (cf_prod)
    if (!tfStateList.includes("aws_acm_certificate.cf_prod")) {
      let cfProdCertArn = null;
      try {
        cfProdCertArn =
          execSync(
            `aws acm list-certificates --region us-east-1 --query "CertificateSummaryList[?DomainName=='prod.${dnsName}'].CertificateArn" --output text`,
            { encoding: "utf8", stdio: "pipe", shell: true }
          ).trim() || null;
      } catch {
        /* ignore */
      }
      if (cfProdCertArn) {
        console.log("Importing aws_acm_certificate.cf_prod");
        try {
          execSync(`terraform import aws_acm_certificate.cf_prod "${cfProdCertArn}"`, {
            stdio: "pipe",
            shell: true,
            cwd: workingDirPath,
          });
        } catch (err) {
          console.warn("Import aws_acm_certificate.cf_prod failed:", err.message);
        }
      }
    }

    // import existing CloudFront cache policy
    if (!tfStateList.includes("aws_cloudfront_cache_policy.html_no_cache")) {
      let cachePolicyId = null;
      try {
        cachePolicyId =
          execSync(
            `aws cloudfront list-cache-policies --type custom --query "CachePolicyList.Items[?CachePolicy.CachePolicyConfig.Name=='${cachePolicyName}'].CachePolicy.Id" --output text`,
            { encoding: "utf8", stdio: "pipe", shell: true }
          ).trim() || null;
      } catch {
        /* ignore */
      }
      if (cachePolicyId) {
        console.log("Importing aws_cloudfront_cache_policy.html_no_cache");
        try {
          execSync(`terraform import aws_cloudfront_cache_policy.html_no_cache "${cachePolicyId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: workingDirPath,
          });
        } catch (err) {
          console.warn("Import aws_cloudfront_cache_policy.html_no_cache failed:", err.message);
        }
      }
    }

    // import existing CloudFront origin request policy
    if (!tfStateList.includes("aws_cloudfront_origin_request_policy.apim_policy")) {
      const originRequestPolicyName = getOriginRequestPolicyName(corpName, "restricted");
      let originRequestPolicyId = null;
      try {
        originRequestPolicyId =
          execSync(
            `aws cloudfront list-origin-request-policies --type custom --query "OriginRequestPolicyList.Items[?OriginRequestPolicy.OriginRequestPolicyConfig.Name=='${originRequestPolicyName}'].OriginRequestPolicy.Id" --output text`,
            { encoding: "utf8", stdio: "pipe", shell: true }
          ).trim() || null;
      } catch {
        /* ignore */
      }
      if (originRequestPolicyId) {
        console.log("Importing aws_cloudfront_origin_request_policy.apim_policy");
        try {
          execSync(`terraform import aws_cloudfront_origin_request_policy.apim_policy "${originRequestPolicyId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: workingDirPath,
          });
        } catch (err) {
          console.warn("Import aws_cloudfront_origin_request_policy.apim_policy failed:", err.message);
        }
      }
    }

    // import existing CloudFront response headers policy
    if (!tfStateList.includes("aws_cloudfront_response_headers_policy.security_hsts_policy")) {
      let responseHeadersPolicyId = null;
      try {
        responseHeadersPolicyId =
          execSync(
            `aws cloudfront list-response-headers-policies --type custom --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='${responseHeadersPolicyName}'].ResponseHeadersPolicy.Id" --output text`,
            { encoding: "utf8", stdio: "pipe", shell: true }
          ).trim() || null;
      } catch {
        /* ignore */
      }
      if (responseHeadersPolicyId) {
        console.log("Importing aws_cloudfront_response_headers_policy.security_hsts_policy");
        try {
          execSync(`terraform import aws_cloudfront_response_headers_policy.security_hsts_policy "${responseHeadersPolicyId}"`, {
            stdio: "pipe",
            shell: true,
            cwd: workingDirPath,
          });
        } catch (err) {
          console.warn("Import aws_cloudfront_response_headers_policy.security_hsts_policy failed:", err.message);
        }
      }
    }

    // if (!tfStateList.includes("aws_cloudwatch_log_group.lambda_edge_auth_guard_logs ")) {
    //   execSync(`terraform import aws_cloudwatch_log_group.lambda_edge_auth_guard_logs /aws/lambda/${lambdaEdgeAuthGuardName}`, {
    //     stdio: "inherit",
    //     shell: true,
    //     cwd: resolve(__dirname, workingDirName),
    //   });
    // }

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
