/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import EnvBranchDetail from "../cards/Repo/EnvBranchDetail";
import EnvBranchDetailV2 from "../cards/RepoV2/EnvBranchDetail";
import theme from "../theme";

for (const [name, Detail] of [["Repo", EnvBranchDetail], ["RepoV2", EnvBranchDetailV2]] as const) {
  it.each([
    { branches: [], sourceBranch: "", creatingBranch: false, disabled: false },
    { branches: [], sourceBranch: "", creatingBranch: true, disabled: true },
    { branches: [{ name: "main", commit: "abc", protected: false }], sourceBranch: "", creatingBranch: false, disabled: true },
  ])(`${name} allows recovery from an empty branch list without bypassing other guards ($disabled, $creatingBranch)`, async (scenario) => {
    const rootElement = document.createElement("div");
    const root = createRoot(rootElement);
    const onCreateBranch = vi.fn();
    try {
      await act(async () => root.render(
        <ThemeProvider theme={theme}>
          <Detail
            {...scenario}
            targetBranch="TEST"
            onSourceBranchChange={vi.fn()}
            createBranchError={null}
            onCreateBranch={onCreateBranch}
          />
        </ThemeProvider>,
      ));
      const button = rootElement.querySelector<HTMLButtonElement>("button")!;
      expect(button.disabled).toBe(scenario.disabled);
      await act(async () => button.click());
      if (scenario.disabled) expect(onCreateBranch).not.toHaveBeenCalled();
      else expect(onCreateBranch).toHaveBeenCalledWith("TEST");
    } finally {
      await act(async () => root.unmount());
    }
  });
}
