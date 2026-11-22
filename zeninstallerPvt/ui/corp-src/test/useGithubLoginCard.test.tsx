/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { act, StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@mui/material";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearGithubToken } from "../cards/GithubLogin/useGithubLoginCard";
import { readGithubAuthRecord, useGithubLoginCard, type UseGithubLoginCard } from "../cards/GithubLogin/useGithubLoginCard";
import * as legacyHook from "../cards/GithubLogin/useGithubLoginCard";
import * as legacyCard from "../cards/GithubLogin/GithubLoginCard";
import { clearGithubToken as clearGithubTokenV2, useGithubLoginCardV2, type UseGithubLoginCardV2 } from "../cards/GithubLoginV2/useGithubLoginCardV2";
import { GithubLoginCardV2View } from "../cards/GithubLoginV2/GithubLoginCardV2";
import { createAppContext } from "../appContext";
import { getStoredToken, setStoredToken } from "../logic/tokenStore";
import theme from "../theme";

const { apiMocks } = vi.hoisted(() => ({
  apiMocks: {
    verifyAuth: vi.fn(),
    switchToDirect: vi.fn(),
    switchToBackend: vi.fn(),
    backendLogout: vi.fn(),
    fetchGithubUser: vi.fn(),
  },
}));

// Only the flag is faked: these tests assert on the real exchange's outgoing request.
vi.mock("../api/backend", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/backend")>()),
  BACKEND_CONFIGURED: true,
}));

vi.mock("../api", () => ({
  verifyAuth: apiMocks.verifyAuth,
  switchToDirect: apiMocks.switchToDirect,
  switchToBackend: apiMocks.switchToBackend,
  logout: apiMocks.backendLogout,
  fetchGithubUser: apiMocks.fetchGithubUser,
}));

vi.mock("../api/github", () => ({
  createGithubApi: vi.fn(() => ({ verifyAuth: apiMocks.verifyAuth })),
  fetchGithubUser: apiMocks.fetchGithubUser,
}));

// jsdom refuses real navigation, so the redirect is captured instead of followed.
const navigations: string[] = [];
let v2Store = createAppContext();
beforeEach(() => {
  navigations.length = 0;
  v2Store = createAppContext();
  Object.defineProperty(window, "location", {
    configurable: true,
    value: {
      origin: "http://localhost",
      pathname: "/",
      search: "",
      href: "http://localhost/",
      replace: (u: string) => navigations.push(u),
    },
  });
  Object.defineProperty(window.location, "href", {
    configurable: true,
    get: () => "http://localhost/",
    set: (u: string) => navigations.push(u),
  });
});

function HookHarness(props: { onUpdate: (value: UseGithubLoginCard) => void }) {
  const value = useGithubLoginCard();

  useEffect(() => {
    props.onUpdate(value);
  }, [value, props]);

  return null;
}

function V2Harness({ onUpdate }: { onUpdate: (value: UseGithubLoginCardV2) => void }) {
  const auth = useGithubLoginCardV2(v2Store);
  useEffect(() => onUpdate(auth), [auth, onUpdate]);
  return (
    <ThemeProvider theme={theme}>
      <GithubLoginCardV2View auth={auth} />
    </ThemeProvider>
  );
}

function getV2Shared() {
  const entry = v2Store.getSnapshot().cards.github_login_v2;
  return entry?.initialised ? entry : undefined;
}

async function waitFor(assertion: () => void, timeoutMs = 1500) {
  const start = Date.now();
  while (true) {
    try {
      assertion();
      return;
    } catch (error) {
      if (Date.now() - start > timeoutMs) throw error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }
}

describe("useGithubLoginCard", () => {
  beforeEach(() => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    vi.clearAllMocks();
    sessionStorage.clear();
    // The live token is a module variable, so clearing storage alone leaks it between tests.
    clearGithubToken();
    clearGithubTokenV2();
    apiMocks.verifyAuth.mockResolvedValue({ login: "octocat" });
  });

  it("starts idle when no auth record is saved", async () => {
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(apiMocks.verifyAuth).not.toHaveBeenCalled();
      expect(latest?.loggingIn).toBe(false);
      expect(latest?.account).toBeNull();
      expect(latest?.status).toBe("idle");
      expect(latest?.summary).toBe("Connect your GitHub account");
      expect(latest?.cardId).toBe("github_login");
      expect(latest?.cardDependencyLabel).toBe("Sign in to GitHub");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("returns null when auth record JSON is invalid", () => {
    sessionStorage.setItem("zeninstaller_github_auth", "{not-valid-json");
    expect(readGithubAuthRecord()).toBeNull();
  });

  it("treats invalid saved auth record as missing and stays idle", async () => {
    sessionStorage.setItem("zeninstaller_github_auth", "{not-valid-json");

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(apiMocks.verifyAuth).not.toHaveBeenCalled();
      expect(latest?.status).toBe("idle");
      expect(latest?.loggingIn).toBe(false);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("restores backend auth from session storage on mount", async () => {
    sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));
    sessionStorage.setItem("github_access_token", "gho_restored");

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      // The browser holds the token, but backend mode still spends it through the proxy.
      expect(apiMocks.switchToBackend).toHaveBeenCalledTimes(1);
      expect(apiMocks.switchToDirect).not.toHaveBeenCalled();
      expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
      expect(latest?.mode).toBe("backend");
      expect(latest?.account?.login).toBe("octocat");
      expect(latest?.status).toBe("complete");
      expect(latest?.done).toBe(true);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("restores direct auth and switches the API into direct mode", async () => {
    sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "direct", token: "ghp_saved" }));

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_saved");
      expect(apiMocks.verifyAuth).toHaveBeenCalledTimes(1);
      expect(latest?.mode).toBe("direct");
      expect(latest?.token).toBe("ghp_saved");
      expect(latest?.account?.login).toBe("octocat");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("preserves session record and marks expired when mount auth verification fails", async () => {
    sessionStorage.setItem("github_access_token", "gho_restored");
    sessionStorage.setItem("zeninstaller_github_auth", JSON.stringify({ mode: "backend" }));
    apiMocks.verifyAuth.mockRejectedValueOnce(new Error("expired"));

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
      expect(latest?.account).toBeNull();
      expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({ mode: "backend" });
      expect(latest?.sessionExpired).toBe(true);
      expect(latest?.status).toBe("idle");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("sends the user to GitHub and keeps the PKCE verifier for the callback", async () => {
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
    });

    await act(async () => {
      await latest!.login();
    });

    await waitFor(() => {
      expect(navigations.some((u) => u.startsWith("https://github.com/login/oauth/authorize"))).toBe(true);
      // The verifier has to survive the redirect or the exchange cannot prove anything.
      expect(sessionStorage.getItem("github_pkce_verifier")).toBeTruthy();
      expect(latest?.redirecting).toBe("login");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("preserves direct token when setting direct mode again", async () => {
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
    });

    await act(async () => {
      latest?.setMode("direct");
      latest?.setToken("ghp_keep_me");
      latest?.setMode("direct");
    });

    await act(async () => {
      await latest!.login();
    });

    await waitFor(() => {
      expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_keep_me");
      expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({
        mode: "direct",
        token: "ghp_keep_me",
      });
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("does not login in direct mode when token is missing", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => { });
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
    });

    apiMocks.verifyAuth.mockClear();
    await act(async () => {
      latest?.setMode("direct");
      latest?.setToken(null);
      await latest?.login();
    });

    expect(consoleError).toHaveBeenCalledWith("Missing PAT");
    expect(apiMocks.switchToDirect).not.toHaveBeenCalled();
    expect(apiMocks.verifyAuth).not.toHaveBeenCalled();

    consoleError.mockRestore();
    await act(async () => {
      root.unmount();
    });
  });

  it("spends the code the OAuth return stashed, and signs in as that user", async () => {
    sessionStorage.setItem("github_pkce_verifier", "the-verifier");
    // What captureOAuthReturn leaves behind when the page loads back from GitHub.
    sessionStorage.setItem("oauth_pending_code", "abc123");
    sessionStorage.setItem("oauth_pending_provider", "github");
    // exchangeToken posts to our own backend; nothing else in this test hits the network.
    const exchange = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_exchanged" }),
    });
    vi.stubGlobal("fetch", exchange);
    apiMocks.fetchGithubUser.mockResolvedValueOnce({ login: "octocat" });

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      const body = JSON.parse(exchange.mock.calls[0]?.[1]?.body ?? "{}");
      expect(body.code).toBe("abc123");
      expect(body.code_verifier).toBe("the-verifier");
      // Must equal what startOAuth sent: the base the app is served from.
      expect(body.redirect_uri).toBe(new URL(import.meta.env.BASE_URL, window.location.origin).href);
      expect(sessionStorage.getItem("github_access_token")).toBe("gho_exchanged");
      // Both spent, and useless to anyone who finds them later.
      expect(sessionStorage.getItem("github_pkce_verifier")).toBeNull();
      expect(sessionStorage.getItem("oauth_pending_code")).toBeNull();
      expect(apiMocks.switchToBackend).toHaveBeenCalledTimes(1);
      expect(latest?.account?.login).toBe("octocat");
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("switches to direct mode, stores the token, and clears it on logout", async () => {
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
    });

    await act(async () => {
      latest?.setMode("direct");
      latest?.setToken("ghp_live_token");
    });

    await act(async () => {
      await latest!.login();
    });

    await waitFor(() => {
      expect(apiMocks.switchToDirect).toHaveBeenCalledWith("ghp_live_token");
      expect(latest?.mode).toBe("direct");
      expect(latest?.token).toBe("ghp_live_token");
      expect(JSON.parse(sessionStorage.getItem("zeninstaller_github_auth") ?? "null")).toEqual({
        mode: "direct",
        token: "ghp_live_token",
      });
    });

    await act(async () => {
      await latest!.logout();
    });

    await waitFor(() => {
      expect(apiMocks.backendLogout).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("zeninstaller_github_auth")).toBeNull();
      expect(latest?.account).toBeNull();
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("clears every stored credential on logout", async () => {
    sessionStorage.setItem("github_access_token", "gho_live");
    sessionStorage.setItem("github_pat_token", "ghp_live");
    sessionStorage.setItem("github_pkce_verifier", "left-over");

    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
    });

    await act(async () => {
      await latest?.logout();
    });

    // Signing out is entirely local now, so anything left behind is a token someone could reuse.
    expect(sessionStorage.getItem("github_access_token")).toBeNull();
    expect(sessionStorage.getItem("github_pat_token")).toBeNull();
    expect(sessionStorage.getItem("github_pkce_verifier")).toBeNull();
    expect(sessionStorage.getItem("zeninstaller_github_auth")).toBeNull();
    expect(sessionStorage.getItem("github_login")).toBeNull();
    expect(latest?.account).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("marks sessionExpired when the session-expired event fires", async () => {
    let latest: UseGithubLoginCard | null = null;
    const root = createRoot(document.createElement("div"));

    await act(async () => {
      root.render(
        <HookHarness
          onUpdate={(value) => {
            latest = value;
          }}
        />
      );
    });

    await waitFor(() => {
      expect(latest?.loggingIn).toBe(false);
      expect(latest?.sessionExpired).toBe(false);
    });

    await act(async () => {
      window.dispatchEvent(new Event("auth:session-expired"));
    });

    await waitFor(() => {
      expect(latest?.sessionExpired).toBe(true);
    });

    await act(async () => {
      root.unmount();
    });
  });

  it("uses the new lifecycle for sign-in, failure, retry and sign-out", async () => {
    let latest: UseGithubLoginCardV2 | undefined;
    const oldHook = vi.spyOn(legacyHook, "useGithubLoginCard");
    const oldContent = vi.spyOn(legacyCard, "GithubLoginContent");
    let resolveVerification!: (value: { login: string }) => void;
    apiMocks.verifyAuth.mockReturnValueOnce(new Promise((resolve) => { resolveVerification = resolve; }));
    const container = document.createElement("div");
    const root = createRoot(container);
    try {
      await act(async () => root.render(<V2Harness onUpdate={(value) => { latest = value; }} />));
      expect(oldHook).not.toHaveBeenCalled();
      expect(oldContent).not.toHaveBeenCalled();
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      expect(latest).not.toHaveProperty("shared");
      expect(getV2Shared()).toMatchObject({ status: "ready", githubAccount: null, githubToken: null });
      await act(async () => {
        latest?.privateContext.setMode("direct");
        latest?.privateContext.setToken("ghp_test");
      });
      expect(latest?.privateContext.token).toBe("ghp_test");
      expect(latest).not.toHaveProperty("login");
      expect(typeof latest?.privateContext.login).toBe("function");
      expect(getV2Shared()).not.toHaveProperty("token");
      expect(JSON.stringify(getV2Shared())).not.toContain("ghp_test");
      expect(container.textContent).toContain("Connect with PAT");
      await act(async () => { void latest?.privateContext.login(); });
      expect(latest?.baseCardContext.lifecycle).toBe("action");
      expect(getV2Shared()).toEqual({ initialised: true, title: "GitHub login 2", status: "action", githubAccount: null, githubToken: null, githubMode: null });
      await act(async () => resolveVerification({ login: "octocat" }));
      expect(latest?.baseCardContext.lifecycle).toBe("complete");
      expect(latest?.privateContext.done).toBe(true);
      expect(latest?.privateContext.account).toEqual({ login: "octocat" });
      expect(JSON.stringify(getV2Shared())).not.toContain("ghp_test");
      expect(container.textContent).toContain("Authenticated as");

      await act(async () => window.dispatchEvent(new Event("auth:session-expired:github_login_v2")));
      await act(async () => { await latest?.privateContext.logout(); });
      expect(latest?.baseCardContext.lifecycle).toBe("ready");
      expect(latest?.privateContext.sessionExpired).toBe(false);
      expect(latest?.privateContext.done).toBe(false);
      await act(async () => latest?.privateContext.setToken("ghp_test"));
      apiMocks.verifyAuth.mockRejectedValueOnce(new Error("invalid token"));
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => { });
      try {
        await act(async () => { await latest?.privateContext.login(); });
        expect(latest?.baseCardContext.lifecycle).toBe("error");
        expect(latest?.privateContext.done).toBe(false);
        await act(async () => { await latest?.privateContext.login(); });
        expect(latest?.baseCardContext.lifecycle).toBe("complete");
      } finally {
        errorLog.mockRestore();
      }
    } finally {
      await act(async () => root.unmount());
      oldHook.mockRestore();
      oldContent.mockRestore();
    }
  });

  it("keeps both signed-in cards, their credentials and expiry events independent", async () => {
    let legacy: UseGithubLoginCard | undefined;
    let v2: UseGithubLoginCardV2 | undefined;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<>
        <HookHarness onUpdate={(value) => { legacy = value; }} />
        <V2Harness onUpdate={(value) => { v2 = value; }} />
      </>));
      expect(legacy?.cardId).toBe("github_login");
      expect(v2?.privateContext.cardId).toBe("github_login_v2");
      await act(async () => {
        legacy?.setMode("direct");
        legacy?.setToken("legacy-token");
        v2?.privateContext.setMode("direct");
        v2?.privateContext.setToken("v2-token");
      });
      apiMocks.verifyAuth.mockResolvedValueOnce({ login: "legacy-user" }).mockResolvedValueOnce({ login: "v2-user" });
      await act(async () => { await legacy?.login(); });
      await act(async () => { await v2?.privateContext.login(); });
      setStoredToken("github_access_token", "legacy-oauth-token");
      setStoredToken("github_login_v2_access_token", "v2-oauth-token");
      expect(legacy?.account).toEqual({ login: "legacy-user" });
      expect(getV2Shared()).toMatchObject({ title: "GitHub login 2", status: "complete", githubAccount: { login: "v2-user" }, githubMode: "direct" });
      expect(getV2Shared()?.githubToken?.reveal()).toBe("v2-token");
      expect(apiMocks.switchToDirect).toHaveBeenCalledOnce();
      expect(apiMocks.switchToDirect).toHaveBeenCalledWith("legacy-token");
      expect(apiMocks.switchToBackend).not.toHaveBeenCalled();

      await act(async () => window.dispatchEvent(new Event("auth:session-expired")));
      expect(legacy?.sessionExpired).toBe(true);
      expect(v2?.privateContext.sessionExpired).toBe(false);
      await act(async () => window.dispatchEvent(new Event("auth:session-expired:github_login_v2")));
      expect(v2?.privateContext.sessionExpired).toBe(true);

      await act(async () => { await v2?.privateContext.logout(); });
      expect(legacy?.account).toEqual({ login: "legacy-user" });
      expect(sessionStorage.getItem("zeninstaller_github_auth")).not.toBeNull();
      expect(getStoredToken(["github_access_token"])).toBe("legacy-oauth-token");
      expect(sessionStorage.getItem("github_login")).toBe("success");
      expect(getV2Shared()?.githubAccount).toBeNull();
      expect(getV2Shared()?.githubToken).toBeNull();

      await act(async () => v2?.privateContext.setToken("v2-token"));
      await act(async () => { await v2?.privateContext.login(); });
      setStoredToken("github_login_v2_access_token", "v2-oauth-token");
      await act(async () => { await legacy?.logout(); });
      expect(v2?.privateContext.account).toEqual({ login: "octocat" });
      expect(sessionStorage.getItem("zeninstaller_github_login_v2_auth")).not.toBeNull();
      expect(getStoredToken(["github_login_v2_access_token"])).toBe("v2-oauth-token");
      expect(sessionStorage.getItem("github_login_v2_login")).toBe("success");
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("uses action while restoring and verifying a saved session", async () => {
    sessionStorage.setItem("zeninstaller_github_login_v2_auth", JSON.stringify({ mode: "direct", token: "ghp_saved" }));
    let latest: UseGithubLoginCardV2 | undefined;
    let resolveVerification!: (value: { login: string }) => void;
    apiMocks.verifyAuth.mockReturnValueOnce(new Promise((resolve) => { resolveVerification = resolve; }));
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<V2Harness onUpdate={(value) => { latest = value; }} />));
      expect(latest?.baseCardContext.lifecycle).toBe("action");
      await act(async () => resolveVerification({ login: "octocat" }));
      expect(latest?.baseCardContext.lifecycle).toBe("complete");
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("does not restore a shared token when verification finishes after logout", async () => {
    let latest: UseGithubLoginCardV2 | undefined;
    let resolveVerification!: (value: { login: string }) => void;
    apiMocks.verifyAuth.mockReturnValueOnce(new Promise((resolve) => { resolveVerification = resolve; }));
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<V2Harness onUpdate={(value) => { latest = value; }} />));
      await act(async () => { latest?.privateContext.setMode("direct"); latest?.privateContext.setToken("v2-token"); });
      await act(async () => { void latest?.privateContext.login(); });
      await act(async () => { await latest?.privateContext.logout(); });
      await act(async () => resolveVerification({ login: "late-user" }));
      expect(getV2Shared()).toMatchObject({ githubAccount: null, githubToken: null, githubMode: null, status: "ready" });
    } finally {
      await act(async () => root.unmount());
    }
  });

  it("completes the OAuth callback with the independent V2 hook", async () => {
    sessionStorage.setItem("github_login_v2_pkce_verifier", "the-verifier");
    sessionStorage.setItem("oauth_pending_code:github_login_v2", "abc123");
    sessionStorage.setItem("oauth_pending_provider:github_login_v2", "github_login_v2");
    const exchange = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "gho_exchanged" }),
    });
    vi.stubGlobal("fetch", exchange);
    apiMocks.fetchGithubUser.mockResolvedValueOnce({ login: "octocat" });
    let latest: UseGithubLoginCardV2 | undefined;
    let legacy: UseGithubLoginCard | undefined;
    const root = createRoot(document.createElement("div"));
    try {
      await act(async () => root.render(<StrictMode>
        <HookHarness onUpdate={(value) => { legacy = value; }} />
        <V2Harness onUpdate={(value) => { latest = value; }} />
      </StrictMode>));
      await waitFor(() => {
        expect(latest?.baseCardContext.lifecycle).toBe("complete");
        expect(latest?.privateContext.account?.login).toBe("octocat");
      });
      expect(JSON.parse(exchange.mock.calls[0][1].body)).toMatchObject({ code: "abc123", code_verifier: "the-verifier" });
      expect(exchange).toHaveBeenCalledOnce();
      expect(legacy?.account).toBeNull();
      expect(apiMocks.switchToBackend).not.toHaveBeenCalled();
      expect(sessionStorage.getItem("oauth_pending_code:github_login_v2")).toBeNull();
      expect(sessionStorage.getItem("github_login_v2_pkce_verifier")).toBeNull();
    } finally {
      await act(async () => root.unmount());
      vi.unstubAllGlobals();
    }
  });
});
