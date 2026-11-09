/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useState } from "react";
import { ensureScopeConsent, hasScopeConsent } from "../../auth/msal";
import {
  addAwsSsoSigningCertificate,
  configureAwsSsoApp,
  createAwsSsoApp,
  ensureAwsSsoGroupAssignment,
  findAwsSsoApp,
  getAwsSsoSigningCertificate,
  getGroupByName,
  hasAwsSsoRoleClaim,
  setAwsSsoClaims,
} from "../../api/azureGraph";
import { AWS_SSO_ADMIN_GROUP, AWS_SSO_APP_NAME } from "../../config/awsConfig";
import { useStepRunner } from "../../hooks/util/useStepRunner";
import type { AzureAccount, AzureConfigHook, CardHook, CardStatus } from "../../types";
import { AWS_SSO_SCOPES, awsRoleClaim } from "./config";

// Reuses the active signing certificate, else adds one; true if it added one.
async function ensureCertificate(account: AzureAccount, spId: string, tid?: string): Promise<boolean> {
  if (await getAwsSsoSigningCertificate(account, spId, tid)) return false;
  await addAwsSsoSigningCertificate(account, spId, tid);
  return true;
}

export type UseAwsSsoCardParams = { azureAccount: AzureAccount | null; tenantId: string | null; awsAccountId: string | null };

// Result of the read-only check on open.
export type AwsSsoPrecheck = "checking" | "needsConsent" | "needsGroup" | "ready";

export type UseAwsSsoCard = CardHook &
  AzureConfigHook & {
    readonly cardId: "aws_sso";
    error: string | null;
    precheck: AwsSsoPrecheck;
    precheckError: string | null;
    grant: () => Promise<void>;
    recheck: () => void;
  };

// The Entra side of AWS console sign-in.
export function useAwsSsoCard({ azureAccount, tenantId, awsAccountId }: UseAwsSsoCardParams): UseAwsSsoCard {
  const { steps, setSteps, running, setRunning, updateStep, resetSteps } = useStepRunner();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [precheck, setPrecheck] = useState<AwsSsoPrecheck>("checking");
  const [precheckError, setPrecheckError] = useState<string | null>(null);
  const [recheckKey, setRecheckKey] = useState(0);
  const tid = tenantId || undefined;
  const adminClaim = awsAccountId && tenantId ? awsRoleClaim(awsAccountId, tenantId, "admin") : null;
  const readOnlyClaim = awsAccountId && tenantId ? awsRoleClaim(awsAccountId, tenantId, "readonly") : null;

  // Read-only on open: consent, the admin group, and whether setup is already done.
  useEffect(() => {
    if (!azureAccount || !adminClaim) return;
    let cancelled = false;
    (async (): Promise<{ precheck: AwsSsoPrecheck; done: boolean }> => {
      if (!(await hasScopeConsent(azureAccount, AWS_SSO_SCOPES, tid))) return { precheck: "needsConsent", done: false };
      const group = await getGroupByName(azureAccount, AWS_SSO_ADMIN_GROUP, tid);
      const app = await findAwsSsoApp(azureAccount, AWS_SSO_APP_NAME, tid);
      const done =
        !!app && !!(await getAwsSsoSigningCertificate(azureAccount, app.spId, tid)) && (await hasAwsSsoRoleClaim(azureAccount, app.spId, adminClaim, tid));
      return { precheck: group ? "ready" : "needsGroup", done };
    })().then(
      (r) => {
        if (cancelled) return;
        setPrecheck(r.precheck);
        setDone(r.done);
        setPrecheckError(null);
      },
      (err) => !cancelled && setPrecheckError(err instanceof Error ? err.message : String(err))
    );
    return () => {
      cancelled = true;
    };
  }, [azureAccount, adminClaim, tid, recheckKey]);

  const recheck = useCallback(() => {
    setPrecheck("checking");
    setPrecheckError(null);
    setRecheckKey((k) => k + 1);
  }, []);

  // Redirects to the consent page; the check reruns on return.
  const grant = useCallback(async () => {
    if (!azureAccount) return;
    if (!(await ensureScopeConsent(azureAccount, AWS_SSO_SCOPES, tid))) recheck();
  }, [azureAccount, tid, recheck]);

  const run = useCallback(async () => {
    if (!azureAccount || !adminClaim || !readOnlyClaim) return;
    setRunning(true);
    setError(null);
    setSteps([
      { id: "app", label: `Create the ${AWS_SSO_APP_NAME} enterprise app`, status: "pending" },
      { id: "saml", label: "Turn on SAML sign-in", status: "pending" },
      { id: "cert", label: "Create the SAML signing certificate", status: "pending" },
      { id: "group", label: `Let ${AWS_SSO_ADMIN_GROUP} open the app`, status: "pending" },
      { id: "claims", label: "Send the AWS roles in the SAML sign-in", status: "pending" },
    ]);
    let current = "app";
    try {
      updateStep("app", "running");
      const existing = await findAwsSsoApp(azureAccount, AWS_SSO_APP_NAME, tid);
      const app = existing ?? (await createAwsSsoApp(azureAccount, AWS_SSO_APP_NAME, tid));
      updateStep("app", existing ? "skipped" : "done", existing ? "Already exists" : "Created");

      current = "saml";
      updateStep("saml", "running");
      await configureAwsSsoApp(azureAccount, app, tid);
      updateStep("saml", "done");

      current = "cert";
      updateStep("cert", "running");
      const certCreated = await ensureCertificate(azureAccount, app.spId, tid);
      updateStep("cert", certCreated ? "done" : "skipped", certCreated ? "Created" : "Already exists");

      current = "group";
      updateStep("group", "running");
      const group = await getGroupByName(azureAccount, AWS_SSO_ADMIN_GROUP, tid);
      if (!group) throw new Error(`No ${AWS_SSO_ADMIN_GROUP} group in this tenant: run the Organisation security groups stage first`);
      const assigned = await ensureAwsSsoGroupAssignment(azureAccount, app.spId, group.id, tid);
      updateStep("group", assigned ? "done" : "skipped", assigned ? "Assigned" : "Already assigned");

      current = "claims";
      updateStep("claims", "running");
      await setAwsSsoClaims(azureAccount, app.spId, { readOnly: readOnlyClaim, admin: adminClaim, adminGroupId: group.id }, tid);
      updateStep("claims", "done", `${AWS_SSO_ADMIN_GROUP} gets the admin role, anyone else assigned gets read-only`);

      setDone(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      updateStep(current, "error", msg);
      setError(msg);
    } finally {
      setRunning(false);
    }
  }, [azureAccount, adminClaim, readOnlyClaim, tid, setRunning, setSteps, updateStep]);

  const reset = useCallback(() => {
    resetSteps();
    setError(null);
  }, [resetSteps]);

  const status: CardStatus = done ? "complete" : error ? "error" : "warning";
  const summary = done ? `${AWS_SSO_ADMIN_GROUP} can open ${AWS_SSO_APP_NAME}` : "Create the AWS console sign-in app";

  return {
    cardId: "aws_sso",
    status,
    summary,
    cardRequirements: ["repo", "azure_login"],  // AWS_ACCOUNT_ID is saved to the repo's environment, so no AWS sign-in is needed.
    cardDependencyLabel: "Create the AWS console sign-in app",
    done,
    steps,
    running,
    run,
    reset,
    error,
    precheck,
    precheckError,
    grant,
    recheck,
  };
}
