/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { createContext, useContext } from "react";
import type { Account, AzureAccount, GhEnv } from "../types";
import type { UseGithubVariables } from "../hooks/useGithubVariables";
import type { UseUrlRestoreResult } from "../hooks/useUrlStateManager";
import type { UseGithubLoginCard } from "../cards/GithubLogin/useGithubLoginCard";
import type { UseRepoCard } from "../cards/Repo/useRepoCard";
import type { UseAzureLoginCard } from "../cards/AzureLogin/useAzureLoginCard";
import type { UseAzureSubscriptionCard } from "../cards/AzureSubscription/useAzureSubscriptionCard";
import type { UseAwsLoginCard } from "../cards/AwsLogin/useAwsLoginCard";

/*
 * The sessions every card works against, so a card reads them itself instead of App passing
 * them down. Their state is the foundation cards' (sign-ins, repo, subscription), which other
 * cards can't do without, so SessionProvider runs those hooks once for the whole page.
 */
export type GithubSession = {
  login: UseGithubLoginCard;
  repoEnv: UseRepoCard;
  // The variables belong to the selected repo + environment, so they come with it.
  variables: UseGithubVariables;
  account: Account | null;
  repoName: string;
  repoId: number | null;
  repoFullName: string | null;
  selectedEnv: GhEnv | null;
  githubUrl?: string;
};

export type AzureSession = {
  login: UseAzureLoginCard;
  subscription: UseAzureSubscriptionCard;
  account: AzureAccount | null;
  subscriptionId: string;
};

export type AwsSession = {
  login: UseAwsLoginCard;
};

export const GithubSessionContext = createContext<GithubSession | null>(null);
export const AzureSessionContext = createContext<AzureSession | null>(null);
export const AwsSessionContext = createContext<AwsSession | null>(null);
// The ?account=…&tenant=… restore spans both GitHub and Azure, so it sits beside them.
export const UrlRestoreContext = createContext<UseUrlRestoreResult | null>(null);

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`${name} needs SessionProvider`);
  return value;
}

export function useGithubSession(): GithubSession {
  return required(useContext(GithubSessionContext), "useGithubSession");
}

export function useAzureSession(): AzureSession {
  return required(useContext(AzureSessionContext), "useAzureSession");
}

export function useAwsSession(): AwsSession {
  return required(useContext(AwsSessionContext), "useAwsSession");
}

export function useUrlRestoreStatus(): UseUrlRestoreResult {
  return required(useContext(UrlRestoreContext), "useUrlRestoreStatus");
}
