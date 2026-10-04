/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { execFileSync } from "node:child_process";
import { X509Certificate } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

const federationMetadataUrl = process.env.FEDERATION_METADATA_URL;
const metadataPathInput = process.env.METADATA_PATH || "./federationmetadata.xml";
const samlProviderArn = process.env.SAML_PROVIDER_ARN;
const maxRetries = Number.parseInt(process.env.MAX_RETRIES || "20", 10);
const retryDelaySeconds = Number.parseInt(process.env.RETRY_DELAY_SECONDS || "5", 10);
const minSigningCerts = Number.parseInt(process.env.MIN_SIGNING_CERTS || "1", 10);
const expectedSigningThumbprint = (process.env.EXPECTED_SIGNING_THUMBPRINT || "").replace(/[^A-Fa-f0-9]/g, "").toUpperCase();

if (!federationMetadataUrl) {
  console.error("FEDERATION_METADATA_URL is required.");
  process.exit(1);
}

if (!samlProviderArn) {
  console.error("SAML_PROVIDER_ARN is required.");
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function countSigningDescriptors(xml) {
  const matches = xml.match(/<[^>]*KeyDescriptor\b[^>]*\buse=["']signing["'][^>]*>/gi);
  return matches ? matches.length : 0;
}

function hasEntityDescriptor(xml) {
  return /<[^>]*EntityDescriptor\b[^>]*\bentityID=/.test(xml);
}

function hasX509Certificate(xml) {
  return /<[^>]*X509Certificate\b[^>]*>[\s\S]*?<\/[^>]*X509Certificate>/.test(xml);
}

function extractAllX509Certificates(xml) {
  const matches = [...xml.matchAll(/<[^>]*X509Certificate\b[^>]*>([\s\S]*?)<\/[^>]*X509Certificate>/gi)];
  return matches.map((m) => (m && m[1] ? m[1].replace(/\s+/g, "").trim() : "")).filter(Boolean);
}

function certificateBase64ToPem(certBase64) {
  const body = certBase64.match(/.{1,64}/g)?.join("\n") || certBase64;
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----`;
}

function extractX509Thumbprints(xml) {
  const certValues = extractAllX509Certificates(xml);
  const thumbprints = [];

  for (const certValue of certValues) {
    try {
      const cert = new X509Certificate(certificateBase64ToPem(certValue));
      const normalized = cert.fingerprint.replace(/:/g, "").toUpperCase();
      thumbprints.push(normalized);
    } catch {
      // Ignore malformed certificate values and continue checking others.
    }
  }

  return thumbprints;
}

function toAwsCliFileParam(filePath) {
  if (process.platform === "win32") {
    return `file://${filePath.replace(/\//g, "\\")}`;
  }
  return `file://${filePath}`;
}

async function fetchMetadata(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText}`);
  }
  return response.text();
}

async function main() {
  const metadataPath = isAbsolute(metadataPathInput) ? metadataPathInput : resolve(process.cwd(), metadataPathInput);
  let lastCheck = { entity: false, cert: false, signingCount: 0, thumbprintMatched: expectedSigningThumbprint ? false : true };

  for (let count = 0; count < maxRetries; count += 1) {
    try {
      const xml = await fetchMetadata(federationMetadataUrl);
      const entity = hasEntityDescriptor(xml);
      const cert = hasX509Certificate(xml);
      const signingCount = countSigningDescriptors(xml);
      const thumbprints = extractX509Thumbprints(xml);
      const thumbprintMatched = !expectedSigningThumbprint || thumbprints.includes(expectedSigningThumbprint);
      lastCheck = { entity, cert, signingCount, thumbprintMatched };

      console.log(`Attempt ${count + 1}/${maxRetries}: entity=${entity} cert=${cert} signing=${signingCount} thumbprintMatched=${thumbprintMatched}`);

      if (entity && cert && signingCount >= minSigningCerts && thumbprintMatched) {
        console.log("Metadata ready and minimum signing cert count found");
        console.log("updating AWS SAML provider with latest metadata.");

        mkdirSync(dirname(metadataPath), { recursive: true });
        writeFileSync(metadataPath, xml, "utf8");

        const metadataDocumentArg = toAwsCliFileParam(metadataPath);
        const expectedCerts = extractAllX509Certificates(xml);

        try {
          execFileSync("aws", ["iam", "update-saml-provider", "--saml-provider-arn", samlProviderArn, "--saml-metadata-document", metadataDocumentArg], {
            stdio: "inherit",
          });

          const appliedMetadata = execFileSync(
            "aws",
            ["iam", "get-saml-provider", "--saml-provider-arn", samlProviderArn, "--query", "SAMLMetadataDocument", "--output", "text"],
            { encoding: "utf8", stdio: "pipe" }
          );

          const appliedCerts = extractAllX509Certificates(appliedMetadata || "");
          const missingCerts = expectedCerts.filter((certValue) => !appliedCerts.includes(certValue));

          if (!appliedMetadata || expectedCerts.length === 0 || missingCerts.length > 0) {
            console.error("AWS SAML provider metadata certificates did not match the latest app metadata after update.");
            process.exit(1);
          }

          console.log(`AWS SAML provider metadata verified. certs=${appliedCerts.length}`);
        } catch (error) {
          console.error(`AWS update-saml-provider failed using ${metadataDocumentArg}`);
          process.exit(1);
        }

        process.exit(0);
      }
    } catch (error) {
      console.log(`Metadata check failed: ${error.message}`);
    }

    console.log(`Metadata not ready yet, wait ${retryDelaySeconds}s...`);
    await sleep(retryDelaySeconds * 1000);
  }

  console.error(
    `Metadata still not ready after retries. Last check: entity=${lastCheck.entity} cert=${lastCheck.cert} signing=${lastCheck.signingCount} thumbprintMatched=${lastCheck.thumbprintMatched} (required signing >= ${minSigningCerts}${expectedSigningThumbprint ? `, thumbprint=${expectedSigningThumbprint}` : ""})`
  );
  process.exit(1);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
