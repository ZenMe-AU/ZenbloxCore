/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { expect, it, vi } from "vitest";
import Card from "../components/Card";
import theme from "../theme";

it("renders locked status with the idle palette in both themes", async () => {
  for (const scheme of [theme.colorSchemes.light, theme.colorSchemes.dark]) {
    for (const colors of [scheme.palette.card.border, scheme.palette.card.icon, scheme.palette.card.summary]) {
      expect(colors.locked).toBe(colors.idle);
    }
  }

  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(
      <ThemeProvider theme={theme}>
        <Card
          cardId="github_signup"
          title="Status test"
          status="locked"
          locked={false}
          requirements={[]}
          unavailable={false}
          expanded
          onToggle={() => {}}
          onRequirementClick={() => {}}
        >
          Content
        </Card>
      </ThemeProvider>
    ));
    expect(container.querySelector(".visually-hidden")?.textContent).toBe("Locked");
    expect(container.querySelector('[data-testid="RadioButtonUncheckedIcon"]')).not.toBeNull();
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("force-unlocks only the selected card without completing its prerequisites", async () => {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let root = createRoot(container);
  const onRequirementClick = vi.fn();
  const render = () => (
    <ThemeProvider theme={theme}>
      {(["repo", "azure_login"] as const).map((cardId) => (
        <Card
          key={cardId}
          cardId={cardId}
          title={cardId}
          status="idle"
          locked
          requirements={[{ label: "Sign in", target: "github_login" }]}
          unavailable={false}
          expanded
          onToggle={() => {}}
          onRequirementClick={onRequirementClick}
        >
          {cardId} content
        </Card>
      ))}
    </ThemeProvider>
  );

  try {
    await act(async () => root.render(render()));
    const repo = container.querySelector("#card-repo")!;
    const azure = container.querySelector("#card-azure_login")!;
    expect(repo.textContent).not.toContain("repo content");
    const unlock = repo.querySelector<HTMLButtonElement>("button.MuiLink-root");
    expect(unlock).not.toBeNull();
    await act(async () => unlock!.click());
    expect(repo.textContent).toContain("repo content");
    expect(repo.textContent).toContain("prerequisites are still incomplete");
    expect(azure.textContent).not.toContain("azure_login content");
    expect(onRequirementClick).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    root = createRoot(container);
    await act(async () => root.render(render()));
    expect(container.querySelector("#card-repo")?.textContent).toContain("repo content");
    expect(container.querySelector("#card-azure_login")?.textContent).not.toContain("azure_login content");
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
