/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import EnvDetail from "../cards/Repo/EnvDetail";
import EnvDetailV2 from "../cards/RepoV2/EnvDetail";
import theme from "../theme";

for (const [name, Detail] of [["Repo", EnvDetail], ["RepoV2", EnvDetailV2]] as const) {
  it.each([
    { missingBranch: true, lockedByPR: false },
    { missingBranch: false, lockedByPR: false },
    { missingBranch: true, lockedByPR: true },
  ])(`${name} positions environment refresh by the missing-branch message ($missingBranch, $lockedByPR)`, async ({ missingBranch, lockedByPR }) => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onRefresh = vi.fn();
    const env = { id: 3, name: "TEST", url: "https://example.test/environment", settingsUrl: "https://example.test/environment" };
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <Detail
            envList={[env]}
            validEnvs={["PROD", "TEST"]}
            selectedEnv={env}
            onEnvChange={vi.fn()}
            lockedByPR={lockedByPR}
            branchMatchWarning={null}
            branchMatchError={missingBranch ? 'No branch found matching environment "TEST".' : null}
            loading={false}
            onRefresh={onRefresh}
            repoFullName="user/repository"
            branches={[]}
            sourceBranch=""
            onSourceBranchChange={vi.fn()}
            creatingBranch={false}
            createBranchError={null}
            onCreateBranch={vi.fn()}
          />
        </ThemeProvider>,
      ));
      const buttons = container.querySelectorAll<HTMLButtonElement>('button[aria-label="Refresh"]');
      expect(buttons.length).toBe(lockedByPR ? 0 : 1);
      if (!lockedByPR) {
        const button = buttons[0];
        if (missingBranch) expect(button.closest('[role="status"]')?.textContent).toContain("No branch found");
        else expect(button.parentElement?.textContent).toContain("Pick the environment");
        await act(async () => button.click());
        expect(onRefresh).toHaveBeenCalledTimes(1);
      }
    } finally {
      await act(async () => root.unmount());
    }
  });
}
