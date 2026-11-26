/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { ThemeProvider } from "@mui/material";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import RepoDetail from "../cards/Repo/RepoDetail";
import RepoDetailV2 from "../cards/RepoV2/RepoDetail";
import type { RepoOption } from "../types";
import theme from "../theme";

for (const [name, Detail] of [["Repo", RepoDetail], ["RepoV2", RepoDetailV2]] as const) {
  describe(`${name} repository selection`, () => {
    for (const scenario of [
      { typed: "new-repo", expected: { id: "new-new-repo", name: "new-repo", isNew: true } },
      { typed: "EXISTING", expected: { id: 1, name: "existing" } },
      { typed: "", expected: null },
      {
        typed: " new-repo ",
        initialRepo: { id: 1, name: "existing" },
        expected: { id: "new-new-repo", name: "new-repo", isNew: true },
      },
      { typed: "new-repo", action: "enter", expected: { id: "new-new-repo", name: "new-repo", isNew: true } },
      { typed: "ex", action: "option", expected: { id: 1, name: "existing" } },
    ]) {
      const action = "action" in scenario ? scenario.action : "blur";
      it(`commits "${scenario.typed}" appropriately on ${action}`, async () => {
        const container = document.createElement("div");
        document.body.appendChild(container);
        const root = createRoot(container);
        const onRepoChange = vi.fn();
        const onClone = vi.fn();
        function Harness() {
          const [selectedRepo, setSelectedRepo] = useState<RepoOption | null>(
            "initialRepo" in scenario ? scenario.initialRepo : null,
          );
          return (
            <ThemeProvider theme={theme}>
              <button type="button">Outside input</button>
              <Detail
                accounts={[{ id: 1, login: "owner", type: "User" }]}
                selectedAccount={{ id: 1, login: "owner", type: "User" }}
                onAccountChange={vi.fn()}
                repos={[{ id: 1, name: "existing" }]}
                selectedRepo={selectedRepo}
                onRepoChange={(repo) => {
                  onRepoChange(repo);
                  setSelectedRepo(repo);
                }}
                templateStatus="ready"
                templateName={null}
                defaultTemplateRepo="owner/template"
                isPrivate
                onIsPrivateChange={vi.fn()}
                includeAllBranch={false}
                onIncludeAllBranchChange={vi.fn()}
                cloning={false}
                cloneError={null}
                onClone={onClone}
                createEnvs={false}
                onCreateEnvsChange={vi.fn()}
                cloneEnvWarning={null}
                repoLoading={false}
                onRefresh={vi.fn()}
              />
            </ThemeProvider>
          );
        }

        try {
          flushSync(() => root.render(<Harness />));
          const input = page.getByPlaceholder("Select or type repo name...");
          await input.click();
          if (scenario.typed) await input.fill(scenario.typed);
          if (action === "enter") await userEvent.keyboard("{Enter}");
          else if (action === "option") await page.getByRole("option", { name: "existing", exact: true }).click();
          else await page.getByRole("button", { name: "Outside input" }).click();

          if (scenario.expected) {
            await expect.poll(() => onRepoChange.mock.lastCall?.[0]).toEqual(scenario.expected);
            await expect.element(input).toHaveValue(scenario.expected.name);
          } else {
            expect(onRepoChange).not.toHaveBeenCalled();
            await expect.element(input).toHaveValue("");
          }
          expect(onClone).not.toHaveBeenCalled();
        } finally {
          flushSync(() => root.unmount());
          container.remove();
          await userEvent.cleanup();
        }
      });
    }
  });
}
