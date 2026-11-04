/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { ReactNode } from "react";
import { useGithubLoginCard } from "../cards/GithubLogin/useGithubLoginCard";
import { useRepoCard } from "../cards/Repo/useRepoCard";
import { useAzureLoginCard } from "../cards/AzureLogin/useAzureLoginCard";
import { useAzureSubscriptionCard } from "../cards/AzureSubscription/useAzureSubscriptionCard";
import { useAwsLoginCard } from "../cards/AwsLogin/useAwsLoginCard";
import { useGithubVariables } from "../hooks/useGithubVariables";
import { useUrlRestore, useUrlSync } from "../hooks/useUrlStateManager";
import { AwsSessionContext, AzureSessionContext, GithubSessionContext, UrlRestoreContext, useAzureSession, useGithubSession } from ".";

function GithubSessionProvider({ children }: { children: ReactNode }) {
  const login = useGithubLoginCard();
  const repoEnv = useRepoCard({ user: login.account });
  const { selectedAccount: account, selectedRepo: repo } = repoEnv.repo;
  const variables = useGithubVariables({
    account,
    repoName: repo?.name ?? null,
    envName: repoEnv.env.branchMatchError ? null : (repoEnv.env.selectedEnv?.name ?? null),
  });
  return (
    <GithubSessionContext
      value={{
        login,
        repoEnv,
        variables,
        account,
        repoName: repo?.name ?? "",
        repoId: typeof repo?.id === "number" ? repo.id : null,
        repoFullName: account && repo ? `${account.login}/${repo.name}` : null,
        selectedEnv: repoEnv.env.selectedEnv,
        githubUrl: repoEnv.githubEnvUrl,
      }}
    >
      {children}
    </GithubSessionContext>
  );
}

// Inside the GitHub session: the saved tenant and subscription are GitHub variables.
function AzureSessionProvider({ children }: { children: ReactNode }) {
  const { variables } = useGithubSession();
  const login = useAzureLoginCard({ savedTenantId: variables.values.AZURE_TENANT_ID ?? "" });
  const subscription = useAzureSubscriptionCard({
    azureAccount: login.account,
    confirmedTenantId: login.confirmedTenantId,
    manualTenantId: login.manualTenantId,
    savedSubscriptionId: variables.values.AZURE_SUBSCRIPTION_ID ?? "",
  });
  return (
    <AzureSessionContext value={{ login, subscription, account: login.account, subscriptionId: subscription.selectedSubscriptionId }}>
      {children}
    </AzureSessionContext>
  );
}

function AwsSessionProvider({ children }: { children: ReactNode }) {
  const login = useAwsLoginCard();
  return <AwsSessionContext value={{ login }}>{children}</AwsSessionContext>;
}

// Applies ?account=&repo=&env=&tenant=&subscription= on load, then keeps the URL in step with the selection.
function UrlRestoreProvider({ children }: { children: ReactNode }) {
  const github = useGithubSession();
  const azure = useAzureSession();
  const urlRestore = useUrlRestore([
    {
      active: github.login.status === "complete",
      fields: {
        account: github.repoEnv.repo.restore.account,
        repo: github.repoEnv.repo.restore.repo,
        env: github.repoEnv.env.restore.env,
      },
    },
    {
      active: !!azure.account,
      disabled: azure.login.status === "unavailable",
      fields: {
        tenant: azure.login.restore.tenant,
        subscription: azure.subscription.restore.subscription,
      },
    },
  ]);
  const selectedRepo = github.repoEnv.repo.selectedRepo;
  useUrlSync(
    {
      account: github.account?.login,
      repo: selectedRepo && !selectedRepo.isNew ? selectedRepo.name : undefined,
      env: github.selectedEnv?.name,
      tenant: azure.login.confirmedTenantId || undefined,
      subscription: azure.subscriptionId || undefined,
    },
    urlRestore.completed && !github.login.loggingIn
  );
  return <UrlRestoreContext value={urlRestore}>{children}</UrlRestoreContext>;
}

export default function SessionProvider({ children }: { children: ReactNode }) {
  return (
    <GithubSessionProvider>
      <AzureSessionProvider>
        <AwsSessionProvider>
          <UrlRestoreProvider>{children}</UrlRestoreProvider>
        </AwsSessionProvider>
      </AzureSessionProvider>
    </GithubSessionProvider>
  );
}
