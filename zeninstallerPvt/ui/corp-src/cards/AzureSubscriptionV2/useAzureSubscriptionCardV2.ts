/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer, useState, useSyncExternalStore } from "react";
import { listSubscriptions, type Subscription } from "../../api/azureGraph";
import { createGithubApi } from "../../api/github";
import type { AppContext, SharedCard } from "../../appContext";
import { checkPrerequisites, type BaseCardContext } from "../../components/useBaseCard";
import { useGithubVariablesV2, type GithubTarget, type UseGithubVariablesV2 } from "../../hooks/useGithubVariablesV2";
import { getEnvSettingsUrl } from "../../logic/github";
import type { CardHook, CardId, CardStatus } from "../../types";
import {
  deriveLifecycle,
  getGithubTarget,
  getPrerequisites,
  initialCardContext,
  initialState,
  reducer,
  stateGraph,
  toBaseCardLifecycle,
  type Lifecycle,
} from "./stateMachine";

// ─── Types ────────────────────────────────────────────────────────────────────

// What only this card knows: the subscriptions, the pick, and where it is saved.
export type PrivateContext = {
  blockedBy: { cardId: CardId; label: string }[]; // The prerequisites still to finish, while blocked, labelled "Title (card_id)" from AppContext.
  tenantId: string | null;
  subscriptions: Subscription[];
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
};

export interface UseCard extends CardHook {
  readonly cardId: "azure_subscription_v2";
  shared: SharedCard<"azure_subscription_v2">;
  summary: string;
  cardDependencyLabel: string;
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

export default function useCard(appStore: AppContext): UseCard {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const prerequisiteContext = { ...initialCardContext, lifecycle: toBaseCardLifecycle(state.lifecycle) };
  const prerequisites = getPrerequisites(appContext, prerequisiteContext);
  const missing = checkPrerequisites(appContext, prerequisiteContext);
  // Azure login 2 can be complete without an account in AppContext yet; it is still the way on.
  const blockedBy = (missing.length > 0 ? missing : initialCardContext.prerequisiteIds.slice(0, 1)).map((id) => {
    const prerequisite = appContext.cards[id as CardId];
    return { cardId: id as CardId, label: prerequisite?.initialised ? `${prerequisite.title} (${id})` : id };
  });
  const account = prerequisites?.account ?? null;
  const tenantId = prerequisites?.tenantId ?? null;
  const key = account && tenantId ? `${account.homeAccountId}|${tenantId}` : null;

  const [loaded, setLoaded] = useState<{ key: string; subs: Subscription[]; error: string | null } | null>(null);
  const [picked, setPicked] = useState<{ key: string; id: string } | null>(null);
  const [populateCount, setPopulateCount] = useState(0);

  useEffect(() => {
    if (!account || !tenantId) return;
    let cancelled = false;
    const loadKey = `${account.homeAccountId}|${tenantId}`;
    listSubscriptions(account, tenantId)
      .then((subs) => {
        if (cancelled) return;
        setLoaded({ key: loadKey, subs, error: subs.length === 0 ? "No subscriptions found for this account." : null });
        if (subs.length === 1) setPicked({ key: loadKey, id: subs[0].id });
      })
      .catch((err) => {
        if (!cancelled) setLoaded({ key: loadKey, subs: [], error: friendlySubsError(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [account, tenantId]);

  const githubTarget = getGithubTarget(appContext);
  const github = githubTarget && {
    account: githubTarget.account,
    repoName: githubTarget.repository.name,
    envName: githubTarget.environment.name,
    envUrl: getEnvSettingsUrl(`${githubTarget.account.login}/${githubTarget.repository.name}`, githubTarget.environment.id),
  };
  // GitHub is called from the browser whichever way GitHub login 2 got its token; the backend only exchanges it.
  const githubToken = githubTarget?.token;
  const variableApi = useMemo(() => githubToken ? createGithubApi(githubToken.reveal()) : null, [githubToken]);
  const variables = useGithubVariablesV2({ target: github, api: variableApi });
  const forThisKey = !!key && loaded?.key === key;
  const subscriptions = forThisKey ? loaded.subs : [];
  const subsError = forThisKey ? loaded.error : null;
  const savedSubscriptionId = variables.values.AZURE_SUBSCRIPTION_ID ?? "";
  const pickedId = key && picked?.key === key ? picked.id : "";
  const selectedSubscriptionId = pickedId || (subscriptions.some((subscription) => subscription.id === savedSubscriptionId) ? savedSubscriptionId : "");
  const selectedSubscription = subscriptions.find((subscription) => subscription.id === selectedSubscriptionId) ?? null;
  const setSelectedSubscriptionId = (id: string) => {
    if (!key) return;
    setPicked({ key, id });
    setPopulateCount((count) => count + 1);
  };

  const saved = !variables.loading
    && variables.values.AZURE_SUBSCRIPTION_ID === selectedSubscriptionId && variables.values.AZURE_TENANT_ID === tenantId;
  const lifecycle = deriveLifecycle({ prerequisitesMet: !!key, loaded: forThisKey, error: subsError, picked: !!selectedSubscription, saved });
  if (lifecycle !== state.lifecycle) {
    dispatchLifecycle({ type: "transition", lifecycle });
  }
  const done = lifecycle === "saved";
  // The build bakes VITE_AZURE_TENANT_ID in to pin sign-in to this tenant, so it tracks the same choice.
  const populate = (lifecycle === "unsaved" || done) && tenantId
    ? { AZURE_TENANT_ID: tenantId, AZURE_SUBSCRIPTION_ID: selectedSubscriptionId, VITE_AZURE_TENANT_ID: tenantId }
    : undefined;
  const differsFromGithub = lifecycle === "unsaved" && !variables.loading;
  const status: CardStatus = done ? "complete" : lifecycle === "error" || lifecycle === "unsaved" ? "warning" : lifecycle === "loading" ? "loading" : "idle";
  const sharedSubscription = done && selectedSubscription
    ? { id: selectedSubscription.id, displayName: selectedSubscription.displayName, tenantId: selectedSubscription.tenantId }
    : null;
  const summary = ({
    blocked: blockedBy[0].label,
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
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  } satisfies BaseCardContext<Lifecycle>;

  return {
    cardId: "azure_subscription_v2" as const,
    status,
    summary,
    cardDependencyLabel: "Select a subscription",
    done,
    baseCardContext,
    shared: {
      title: baseCardContext.title,
      status: baseCardContext.lifecycle,
      azureSubscription: sharedSubscription,
    } satisfies SharedCard<"azure_subscription_v2">,
    privateContext: {
      blockedBy,
      tenantId,
      subscriptions,
      selectedSubscriptionId,
      setSelectedSubscriptionId,
      populateCount,
      subsError,
      github,
      variables,
      populate,
      differsFromGithub,
    },
  };
}
