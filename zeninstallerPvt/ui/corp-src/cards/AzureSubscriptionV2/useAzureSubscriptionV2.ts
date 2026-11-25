/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listSubscriptions, type Subscription } from "../../api/azureGraph";
import { createGithubApi } from "../../api/github";
import type { AppContext, SharedCard } from "../../appContext";
import { useCardAppContext, type BaseCardContext } from "../../components/useBaseCard";
import { useGithubVariablesV2, type GithubTarget, type UseGithubVariablesV2 } from "../../hooks/useGithubVariablesV2";
import { findIgnoreCase } from "../../logic/search";
import {
  deriveLifecycle,
  getPrerequisites,
  githubLoginCardId,
  initialCardContext,
  initialState,
  reducer,
  repoCardId,
  stateGraph,
  toBaseCardLifecycle,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PrivateContext {
  appContext: ReturnType<AppContext["getSnapshot"]>;
  tenantId: string | null;
  subscriptions: Subscription[];
  subscriptionsLoaded: boolean;
  subscriptionsRefreshing: boolean;
  subscriptionsRefreshError: string | null;
  refreshSubscriptions: () => Promise<void>;
  selectedSubscriptionId: string;
  setSelectedSubscriptionId: (id: string) => void;
  // Goes up on every pick, the same subscription included, so a pick puts it back in the Saved to GitHub draft.
  populateCount: number;
  subsError: string | null;

  // Where the pick is saved; null until GitHub login 2 and Repository & environment 2 are complete.
  github: GithubTarget | null;
  variables: UseGithubVariablesV2;
  populate: Record<string, string> | undefined;
  differsFromGithub: boolean; // The pick or tenant isn't what GitHub holds, whatever the draft says.
}

export interface UseAzureSubscriptionV2 {
  baseCardContext: BaseCardContext<Lifecycle>;
  privateContext: PrivateContext;
}

// Maps a raw MSAL/AADSTS failure to user-facing text — never surface the raw trace/correlation-id blob.
function friendlySubsError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("AADSTS90072")) {
    return "This account isn't a member of that tenant — sign in with a different account, or have an admin add it as a guest first.";
  }
  return "Couldn't load subscriptions for this tenant — check the tenant ID or your access, then try again.";
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAzureSubscriptionV2(appStore: AppContext): UseAzureSubscriptionV2 {
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const { appContext, prerequisites, unmet, blockedSummary } = useCardAppContext(appStore, initialCardContext, getPrerequisites);
  const account = prerequisites?.account ?? null;
  const tenantId = prerequisites?.tenantId ?? null;
  const key = account && tenantId ? `${account.homeAccountId}|${tenantId}` : null;
  const [initialSubscription] = useState(() => appContext.urlParams.subscription);

  const subscriptionsQuery = useQuery({
    queryKey: ["azure_subscription_v2", "subscriptions", account?.homeAccountId, tenantId],
    enabled: !!account && !!tenantId,
    staleTime: Infinity,
    retry: false,
    queryFn: () => listSubscriptions(account!, tenantId!),
  });
  const subscriptions = useMemo(() => subscriptionsQuery.data ?? [], [subscriptionsQuery.data]);
  const subscriptionsLoaded = !!key && !subscriptionsQuery.isPending;

  // Where the pick is saved; Repository & environment 2 publishes it only once it's complete.
  const repo = appContext.cards[repoCardId];
  const github = repo?.initialised && repo.currentBaseCardStatus === "complete" ? repo.githubRepository : null;
  // GitHub is called from the browser whichever way GitHub login 2 got its token; the backend only exchanges it.
  // Nothing loads before github is set, so the token needs no gate of its own.
  const githubLogin = appContext.cards[githubLoginCardId];
  const githubToken = githubLogin?.initialised ? githubLogin.githubToken : null;
  const variableApi = useMemo(() => githubToken ? createGithubApi(githubToken.reveal()) : null, [githubToken]);
  const variables = useGithubVariablesV2({ target: github, api: variableApi });
  const subsError = subscriptionsQuery.error && subscriptions.length === 0
    ? friendlySubsError(subscriptionsQuery.error)
    : subscriptionsLoaded && subscriptions.length === 0 ? "No subscriptions found for this account." : null;
  const subscriptionsRefreshError = subscriptionsQuery.error && subscriptions.length > 0
    ? friendlySubsError(subscriptionsQuery.error)
    : null;
  const refreshSubscriptions = async () => {
    await subscriptionsQuery.refetch();
  };
  const savedSubscriptionId = variables.values.AZURE_SUBSCRIPTION_ID ?? "";
  const initialMatch = initialSubscription
    ? subscriptions.find((subscription) => subscription.id === initialSubscription)
      ?? findIgnoreCase(subscriptions, (subscription) => subscription.displayName, initialSubscription)
    : undefined;
  const preferredSubscriptionId = initialSubscription
    ? initialMatch?.id ?? ""
    : subscriptions.some((subscription) => subscription.id === savedSubscriptionId)
      ? savedSubscriptionId
      : subscriptions.length === 1 ? subscriptions[0].id : "";
  const selectedSubscriptionId = state.scopeKey === key ? state.selectedSubscriptionId : preferredSubscriptionId;
  const selectedSubscription = subscriptions.find((subscription) => subscription.id === selectedSubscriptionId) ?? null;
  const setSelectedSubscriptionId = (id: string) => {
    if (!key) return;
    dispatchLifecycle({ type: "subscription-selected", subscriptionId: id });
  };
  useEffect(() => {
    if (!key) {
      dispatchLifecycle({ type: "scope-synced", scopeKey: null, selectedSubscriptionId: "" });
      return;
    }
    if (!subscriptionsLoaded) return;
    const selectionIsValid = state.scopeKey === key
      && subscriptions.some((subscription) => subscription.id === state.selectedSubscriptionId);
    dispatchLifecycle({
      type: "scope-synced",
      scopeKey: key,
      selectedSubscriptionId: selectionIsValid ? state.selectedSubscriptionId : preferredSubscriptionId,
    });
  }, [key, preferredSubscriptionId, state.scopeKey, state.selectedSubscriptionId, subscriptions, subscriptionsLoaded]);
  const saved = !variables.loading
    && variables.values.AZURE_SUBSCRIPTION_ID === selectedSubscriptionId && variables.values.AZURE_TENANT_ID === tenantId;
  const lifecycle = deriveLifecycle({ prerequisitesMet: !!key, loaded: subscriptionsLoaded, error: subsError, picked: !!selectedSubscription, saved });
  useEffect(() => {
    if (lifecycle !== state.lifecycle) dispatchLifecycle({ type: "transition", lifecycle });
  }, [lifecycle, state.lifecycle]);
  const done = lifecycle === "saved";
  // The build bakes VITE_AZURE_TENANT_ID in to pin sign-in to this tenant, so it tracks the same choice.
  const populate = (lifecycle === "unsaved" || done) && tenantId
    ? { AZURE_TENANT_ID: tenantId, AZURE_SUBSCRIPTION_ID: selectedSubscriptionId, VITE_AZURE_TENANT_ID: tenantId }
    : undefined;
  const differsFromGithub = lifecycle === "unsaved" && !variables.loading;
  const summary = ({
    blocked: blockedSummary,
    loading: "Loading subscriptions...",
    selecting: "Select a subscription",
    unsaved: "Doesn't match what's saved to GitHub", // The header can't see the draft, so it states only what is true either way.
    saved: selectedSubscription?.displayName ?? "Subscription saved",
    error: subsError ?? "No subscriptions in this tenant",
  } satisfies Record<Lifecycle, string>)[lifecycle];

  const baseCardContext = {
    ...initialCardContext,
    summary,
    lifecycle: toBaseCardLifecycle(lifecycle),
    unmetCardPrerequisites: unmet,
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  } satisfies BaseCardContext<Lifecycle>;
  useEffect(() => {
    if (initialSubscription && !subscriptionsLoaded) return;
    appStore.updateUrl({ subscription: selectedSubscriptionId || undefined });
  }, [appStore, initialSubscription, subscriptionsLoaded, selectedSubscriptionId]);
  useEffect(() => {
    appStore.update("azure_subscription_v2", {
      title: baseCardContext.title,
      prerequisiteIds: baseCardContext.prerequisiteIds,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: lifecycle,
      azureSubscription: done && selectedSubscription
        ? { id: selectedSubscription.id, displayName: selectedSubscription.displayName, tenantId: selectedSubscription.tenantId }
        : null,
    } satisfies SharedCard<"azure_subscription_v2">);
  }, [appStore, baseCardContext.title, baseCardContext.prerequisiteIds, baseCardContext.lifecycle, lifecycle, done, selectedSubscription]);

  return {
    baseCardContext,
    privateContext: {
      appContext,
      tenantId,
      subscriptions,
      subscriptionsLoaded,
      subscriptionsRefreshing: subscriptionsQuery.isFetching && !subscriptionsQuery.isPending,
      subscriptionsRefreshError,
      refreshSubscriptions,
      selectedSubscriptionId,
      setSelectedSubscriptionId,
      populateCount: state.populateCount,
      subsError,
      github,
      variables,
      populate,
      differsFromGithub,
    },
  };
}
