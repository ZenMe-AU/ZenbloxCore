/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { findAwsSsoApp, getAwsSsoSigningCertificate } from "../../api/azureGraph";
import { AWS_SSO_APP_NAME, isAwsAccountId } from "../../config/awsConfig";
import { getFederatedSubject } from "../../logic/naming";
import { PIPELINE } from "../../logic/pipeline";
import type { AzureAccount, CardHook, CardStatus } from "../../types";
import { GITHUB_ROLE_NAME, GITHUB_ROLE_OUTPUT } from "./config";
import { samlStackTemplate } from "./samlStackTemplate";

export type GithubRepoIds = { org: string; orgId: number; repo: string; repoId: number };

export type UseAwsSsoStackCardParams = {
  azureAccount: AzureAccount | null;
  tenantId: string | null;
  github: GithubRepoIds | null; // Null until the repo exists on GitHub.
  awsAccountId: string; // The saved AWS_ACCOUNT_ID variable.
  roleArn: string; // The saved AWS_ROLE_ARN variable.
};

export type UseAwsSsoStackCard = CardHook & {
  readonly cardId: "aws_sso_stack";
  template: string | null; // Null until the Entra app has its signing certificate and the repo exists.
  noCertificate: boolean; // The app has no signing certificate yet.
  checking: boolean;
  check: () => void;
  outputError: string | null; // The saved AWS_ROLE_ARN is not this stack's output.
  error: string | null;
};

export function useAwsSsoStackCard({ azureAccount, tenantId, github, awsAccountId, roleArn }: UseAwsSsoStackCardParams): UseAwsSsoStackCard {
  const [certificate, setCertificate] = useState<string | null | undefined>(undefined); // undefined until Entra was read
  const [checking, setChecking] = useState(true);
  const [checkKey, setCheckKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const tid = tenantId || undefined;

  // Reads the console app's current signing certificate.
  useEffect(() => {
    if (!azureAccount) return;
    let cancelled = false;
    (async () => {
      const app = await findAwsSsoApp(azureAccount, AWS_SSO_APP_NAME, tid);
      return app ? await getAwsSsoSigningCertificate(azureAccount, app.spId, tid) : null;
    })()
      .then(
        (cert) => {
          if (cancelled) return;
          setCertificate(cert);
          setError(null);
        },
        (err) => !cancelled && setError(err instanceof Error ? err.message : String(err))
      )
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [azureAccount, tid, checkKey]);

  const check = useCallback(() => {
    setChecking(true);
    setCheckKey((k) => k + 1);
  }, []);

  const subjects = github ? PIPELINE.validEnvs.map((env) => getFederatedSubject(github.org, github.orgId, github.repo, github.repoId, env)) : null;
  const template = certificate && tenantId && subjects ? samlStackTemplate(tenantId, certificate, subjects) : null;
  // Done once the saved role ARN is the stack's output for this AWS account.
  const expectedArn = isAwsAccountId(awsAccountId) ? `arn:aws:iam::${awsAccountId}:role/${GITHUB_ROLE_NAME}` : null;
  const saved = roleArn.trim();
  const done = !!expectedArn && saved === expectedArn;
  const outputError =
    !saved || done
      ? null
      : expectedArn
        ? `That is not the ${GITHUB_ROLE_OUTPUT} output for AWS account ${awsAccountId}: expected ${expectedArn}.`
        : "Save AWS_ACCOUNT_ID first, so this ARN can be checked.";
  const status: CardStatus = done ? "complete" : error ? "error" : "warning";
  const summary = done ? "Console sign-in roles and the GitHub role are in AWS" : "Create the AWS console sign-in stack";

  return {
    cardId: "aws_sso_stack",
    status,
    summary,
    cardRequirements: ["aws_sso", "repo"], // needs the Entra app's certificate and the repo's id
    cardDependencyLabel: "Create the AWS console sign-in stack",
    done,
    template,
    noCertificate: certificate === null,
    checking,
    check,
    outputError,
    error,
  };
}
