/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useMemo, useReducer } from "react";
import { createGithubApi } from "../../api/github";
import type { AppContext } from "../../appContext";
import { useCardAppContext } from "../../components/useBaseCard";
import { usePrivAvdDeploy } from "../../hooks/util/usePrivAvdDeploy";
import { useGithubVariablesV2 } from "../../hooks/useGithubVariablesV2";
import type { Account, GhEnv } from "../../types";
import {
  cardId,
  getBaseCardContext,
  githubLoginCardId,
  initialCardContext,
  initialState,
  reducer,
  repoCardId,
  type Lifecycle,
} from "./stateMachine";
import { PRIVAVD_GALLERY_DIR } from "./config";

export interface UseAvdGalleryV2 {
  baseCardContext: ReturnType<typeof getBaseCardContext>;
  privateContext: {
    appContext: ReturnType<AppContext["getSnapshot"]>;
    deployment: ReturnType<typeof usePrivAvdDeploy>;
    variables: ReturnType<typeof useGithubVariablesV2>;
    selectedEnv: GhEnv | null;
    fetchLog: (account: Account, repoName: string, logId: number) => Promise<string | null>;
  };
}

function deriveLifecycle({
  unmet,
  loading,
  deploying,
  error,
  done,
}: {
  unmet: readonly string[];
  loading: boolean;
  deploying: boolean;
  error: string | null;
  done: boolean;
}): Lifecycle {
  if (unmet.length > 0) return "blocked";
  if (deploying) return "action";
  if (loading) return "loading";
  if (error) return "error";
  return done ? "complete" : "ready";
}

export function useAvdGalleryV2(appStore: AppContext): UseAvdGalleryV2 {
  const [state, dispatch] = useReducer(reducer, initialState);
  const { appContext, prerequisites, unmet, blockedSummary } = useCardAppContext(appStore, initialCardContext);
  const githubToken = prerequisites?.[githubLoginCardId].githubToken;
  const githubApi = useMemo(() => githubToken ? createGithubApi(githubToken.reveal()) : null, [githubToken]);
  const fetchLog = useMemo(() => async (account: Account, repoName: string, logId: number) => {
    if (!githubApi) throw new Error("Connect to GitHub before loading deployment logs");
    return githubApi.fetchLogArtifact(account, repoName, logId);
  }, [githubApi]);
  const target = prerequisites?.[repoCardId].githubRepository ?? null;
  const selectedEnv = target?.environment
    ? { id: target.environment.id, name: target.environment.name, url: target.environment.settingsUrl }
    : null;
  const deployment = usePrivAvdDeploy({
    dir: PRIVAVD_GALLERY_DIR,
    account: target?.account ?? null,
    repoName: target?.repository.name ?? "",
    selectedEnv,
  });
  const variables = useGithubVariablesV2({ target, api: githubApi });
  const lifecycle = deriveLifecycle({
    unmet,
    loading: deployment.status === "loading" || variables.loading,
    deploying: deployment.deploying,
    error: deployment.error,
    done: deployment.done,
  });

  const unmetChanged = state.baseCardContext.unmetCardPrerequisites.length !== unmet.length
    || state.baseCardContext.unmetCardPrerequisites.some((id, index) => id !== unmet[index]);
  if (state.lifecycle !== lifecycle || unmetChanged) {
    dispatch({ type: "sync", lifecycle, unmetCardPrerequisites: unmet });
  }

  const summary = lifecycle === "blocked"
    ? blockedSummary
    : lifecycle === "loading"
      ? "Loading deployment status..."
      : lifecycle === "action"
        ? "Deploying..."
        : lifecycle === "error"
          ? deployment.error ?? "Deployment failed"
        : deployment.summary;
  const baseCardContext = getBaseCardContext(state, summary);

  useEffect(() => {
    appStore.update(cardId, {
      title: baseCardContext.title,
      prerequisiteIds: baseCardContext.prerequisiteIds,
      currentBaseCardStatus: baseCardContext.lifecycle,
      currentStatus: state.lifecycle,
    });
  }, [appStore, baseCardContext.title, baseCardContext.prerequisiteIds, baseCardContext.lifecycle, state.lifecycle]);

  return {
    baseCardContext,
    privateContext: { appContext, deployment, variables, selectedEnv, fetchLog },
  };
}
