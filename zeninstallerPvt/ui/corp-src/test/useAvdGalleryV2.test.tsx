/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAppContext, SensitiveToken } from "../appContext";
import { useAvdGalleryV2 } from "../cards/AvdGalleryV2/useAvdGalleryV2";
import { coreInfraCardId, initialCardContext, initialState, reducer, repoCardId } from "../cards/AvdGalleryV2/stateMachine";
import { checkPrerequisites } from "../components/useBaseCard";

vi.mock("../hooks/util/usePrivAvdDeploy", () => ({
  usePrivAvdDeploy: () => ({
    done: false,
    status: "idle",
    summary: "Not deployed",
    report: null,
    deploying: false,
    error: null,
    terminal: {},
    deploy: vi.fn(),
  }),
}));

vi.mock("../hooks/useGithubVariablesV2", () => ({
  useGithubVariablesV2: () => ({
    values: {},
    loading: false,
    refreshing: false,
    error: false,
    onRefresh: vi.fn(),
    onConfirmed: vi.fn(),
    api: null,
    target: null,
  }),
}));

describe("AvdGalleryV2", () => {
  let appStore: ReturnType<typeof createAppContext>;

  beforeEach(() => {
    appStore = createAppContext();
    appStore.update("github_login_v2", {
      title: "GitHub Login 2",
      currentBaseCardStatus: "complete",
      currentStatus: "signed-in",
      githubAccount: { login: "example" },
      githubToken: new SensitiveToken("token"),
      githubMode: "direct",
    });
    appStore.update(repoCardId, {
      title: "Repository & environment 2",
      prerequisiteIds: ["github_login_v2"],
      currentBaseCardStatus: "complete",
      currentStatus: "complete",
      githubRepository: {
        account: { id: 1, login: "example", type: "User", htmlUrl: "https://github.com/example" },
        repository: { id: 2, name: "repo", htmlUrl: "https://github.com/example/repo" },
        environment: { id: 3, name: "prod", settingsUrl: "https://github.com/example/repo/settings/environments/1" },
      },
    });
    appStore.update(coreInfraCardId, {
      title: "Terraform state backend",
      currentBaseCardStatus: "complete",
      currentStatus: "complete",
    });
  });

  it("returns only the BaseCard and private contexts", async () => {
    let card: ReturnType<typeof useAvdGalleryV2> | undefined;
    function Harness() {
      card = useAvdGalleryV2(appStore);
      return null;
    }

    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(<Harness />));
    expect(Object.keys(card ?? {})).toEqual(["baseCardContext", "privateContext"]);
    expect(card?.baseCardContext).toMatchObject({ cardId: "avd_gallery_v2", lifecycle: "ready" });
    expect(card?.baseCardContext.done).toBe(false);
    expect(appStore.getSnapshot().cards.avd_gallery_v2).toMatchObject({
      initialised: true,
      currentBaseCardStatus: "ready",
    });
    await act(async () => root.unmount());
  });

  it("keeps the legacy Core Infra prerequisite in AppContext", () => {
    appStore.update(coreInfraCardId, {
      title: "Terraform state backend",
      currentBaseCardStatus: "ready",
      currentStatus: "idle",
    });
    expect(checkPrerequisites(appStore.getSnapshot(), initialCardContext)).toEqual([coreInfraCardId]);
  });

  it("syncs prerequisite state without losing its public context", () => {
    const blocked = reducer(initialState, {
      type: "sync",
      lifecycle: "blocked",
      unmetCardPrerequisites: ["repo_v2"],
    });
    expect(blocked.lifecycle).toBe("blocked");
    expect(blocked.baseCardContext.unmetCardPrerequisites).toEqual(["repo_v2"]);

    const ready = reducer(blocked, {
      type: "sync",
      lifecycle: "ready",
      unmetCardPrerequisites: [],
    });
    expect(ready.lifecycle).toBe("ready");
    expect(ready.baseCardContext.prerequisiteIds).toEqual(["github_login_v2", "repo_v2", "core_infra"]);
  });
});
