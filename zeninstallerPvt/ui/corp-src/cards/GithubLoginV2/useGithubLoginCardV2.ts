/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useCallback, useEffect, useReducer, useState, useRef, useSyncExternalStore } from "react";
import { createGithubApi, fetchGithubUser } from "../../api/github";
import { BACKEND_CONFIGURED, exchangeGithubCode, verifyAuthWithToken } from "../../api/backend";
import { appUrl, requestAuthorizationCode, takePendingCode } from "../../logic/oauth";
import { read, remove } from "../../logic/browserStore";
import { clearStoredToken, getStoredToken, setLoginStatus, setStoredToken } from "../../logic/tokenStore";
import type { LoginStatus } from "../../logic/tokenStore";
import {
  GITHUB_AUTHORIZE_URL,
  GITHUB_CLIENT_ID,
  GITHUB_SCOPES,
} from "../../config/githubConfig";
import type { BaseCardContext } from "../../components/useBaseCard";
import { SensitiveToken, type AppContext } from "../../appContext";
import {
  deriveLifecycle,
  initialState,
  reducer,
  stateGraph,
  toBaseCardLifecycle,
  type GithubAccount,
  type Lifecycle as GithubLoginV2Lifecycle,
} from "./stateMachine";

const cardId = "github_login_v2" as const;
const cardTitle: string = "GitHub Login 2";

const AUTH_RECORD_KEY = cardId + "_auth";
const GITHUB_PROVIDER = cardId;
const GITHUB_TOKEN_KEY = cardId +"_access_token";
const GITHUB_TOKEN_KEYS = [GITHUB_TOKEN_KEY, cardId +"_pat_token"] as const;
const GITHUB_VERIFIER_KEY = cardId +"_pkce_verifier";
const SESSION_EXPIRED_EVENT = "auth:session-expired:" + cardId;
type GithubTokenKey = (typeof GITHUB_TOKEN_KEYS)[number];

// ─── Types ────────────────────────────────────────────────────────────────────
export type GithubAuthRecord = { mode: "direct"; token: string } | { mode: "backend" };

export interface PrivateContext {
  account: GithubAccount | null;
  loggingIn: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  sessionExpired: boolean;
  redirecting: "login" | "logout" | null;
  verifying: boolean;
  mode: GithubAuthRecord["mode"] | null;
  setMode: (mode: GithubAuthRecord["mode"]) => void;
  backendAvailable: boolean;
  token: string | null;
  setToken: (token: string | null) => void;
}

// ─── Sign-in ──────────────────────────────────────────────────────────────────
// The GitHub sign-in itself. The mechanism is in logic/oauth, the constants in config/githubConfig.

function setGithubLoginStatus(status: LoginStatus): void {
  setLoginStatus(GITHUB_PROVIDER, status);
}

export function clearGithubToken(key?: GithubTokenKey): void {
  setGithubLoginStatus(null);
  if (key) {
    clearStoredToken(key);
    return;
  }
  for (const k of GITHUB_TOKEN_KEYS) clearStoredToken(k);
  remove(GITHUB_VERIFIER_KEY);
}

async function requestCode(): Promise<void> {
  return requestAuthorizationCode({
    provider: GITHUB_PROVIDER,
    authorizeUrl: GITHUB_AUTHORIZE_URL,
    clientId: GITHUB_CLIENT_ID,
    scope: GITHUB_SCOPES,
    verifierKey: GITHUB_VERIFIER_KEY,
  });
}

// Trades the code GitHub redirected back with for a token, and remembers it.
async function exchangeToken(code: string): Promise<string> {
  const verifier = read(GITHUB_VERIFIER_KEY) ?? "";
  const data = await exchangeGithubCode({
    client_id: GITHUB_CLIENT_ID,
    code,
    code_verifier: verifier,
    redirect_uri: appUrl(),
  });
  if (!data.access_token) throw new Error(data.error ?? "Token exchange failed");
  return data.access_token;
}

// Signing out is entirely local, so anything left behind is a token someone could reuse.
function clearStoredCredentials(): void {
  clearGithubToken();
}

// Whichever sign-in left a token behind — the OAuth one, or a pasted personal access token.
function readStoredToken(): string | null {
  return getStoredToken(GITHUB_TOKEN_KEYS);
}

function verifyGithub(token: string, mode: GithubAuthRecord["mode"]) {
  return mode === "direct"
    ? createGithubApi(token).verifyAuth()
    : verifyAuthWithToken(token, SESSION_EXPIRED_EVENT);
}

// Narrowed to this provider so callers do not have to know the discriminator.
function takeGithubCode(): string | null {
  return takePendingCode(GITHUB_PROVIDER);
}

// ─── Storage ──────────────────────────────────────────────────────────────────
export function readGithubAuthRecord(): GithubAuthRecord | null {
  const raw = sessionStorage.getItem(AUTH_RECORD_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as GithubAuthRecord;
  } catch {
    return null;
  }
}

function writeGithubAuthRecord(record: GithubAuthRecord | null): void {
  if (record === null) sessionStorage.removeItem(AUTH_RECORD_KEY);
  else sessionStorage.setItem(AUTH_RECORD_KEY, JSON.stringify(record));
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useGithubLoginV2(appStore: AppContext) {
  const appContext = useSyncExternalStore(appStore.subscribe, appStore.getSnapshot, appStore.getSnapshot);
  const [loggingIn, setLoggingIn] = useState(true);
  const [account, setAccount] = useState<GithubAccount | null>(null);
  const [session, setSession] = useState<{ token: SensitiveToken; mode: GithubAuthRecord["mode"] } | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false); // TODO: check if this is still needed
  const [redirecting, setRedirecting] = useState<"login" | "logout" | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [mode, setMode] = useState<GithubAuthRecord["mode"]>(BACKEND_CONFIGURED ? "backend" : "direct");
  const [token, setToken] = useState<string | null>(null);
  const loginConfigRef = useRef<GithubAuthRecord>(BACKEND_CONFIGURED ? { mode: "backend" } : { mode: "direct", token: "" });
  const sessionGeneration = useRef(0);
  const pendingExchange = useRef<Promise<string> | null>(null);

  const setModeState = useCallback((nextMode: GithubAuthRecord["mode"]) => {
    if (nextMode === "backend" && !BACKEND_CONFIGURED) return;
    setMode(nextMode);

    if (nextMode === "backend") {
      loginConfigRef.current = { mode: nextMode };
    } else {
      loginConfigRef.current = {
        mode: nextMode,
        token: loginConfigRef.current.mode === "direct" ? loginConfigRef.current.token : "",
      };
    }
  }, []);

  const setTokenState = useCallback((nextToken: string | null) => {
    setToken(nextToken);

    if (loginConfigRef.current.mode === "direct") {
      loginConfigRef.current = {
        mode: "direct",
        token: nextToken ?? "",
      };
    }
  }, []);

  // Verify session on mount
  useEffect(() => {
    const generationRef = sessionGeneration;
    const generation = ++generationRef.current;
    async function init() {
      // ── Returning from GitHub: oauthReturn already put the URL back, so only the code is left ──
      const code = takeGithubCode();
      if (code || pendingExchange.current) {
        // Distinguishes trading the code from the ordinary session check; both keep loggingIn true.
        setRedirecting("login");
        try {
          if (code && !pendingExchange.current) pendingExchange.current = exchangeToken(code);
          const token = await pendingExchange.current!;
          if (generation !== sessionGeneration.current) return;
          // Asked directly because the proxy's own identity check is what we are establishing here.
          setVerifying(true);
          const data = await fetchGithubUser(token);
          if (generation !== sessionGeneration.current) return;
          pendingExchange.current = null;
          setStoredToken(GITHUB_TOKEN_KEY, token);
          remove(GITHUB_VERIFIER_KEY);
          writeGithubAuthRecord({ mode: "backend" });
          setModeState("backend");
          setAccount({ login: data.login });
          setSession({ token: new SensitiveToken(token), mode: "backend" });
          setGithubLoginStatus("success");
        } catch (e) {
          if (generation !== sessionGeneration.current) return;
          pendingExchange.current = null;
          console.error("GitHub token exchange failed:", e);
          setSessionExpired(true);
        } finally {
          if (generation === sessionGeneration.current) {
            setVerifying(false);
            setRedirecting(null);
            setLoggingIn(false);
          }
        }
        return;
      }

      const record = readGithubAuthRecord();
      if (record?.mode === "backend" && !BACKEND_CONFIGURED) {
        writeGithubAuthRecord(null);
        setLoggingIn(false);
        return;
      }
      if (!record) {
        setLoggingIn(false);
        return;
      }
      setModeState(record.mode);
      // Either way the browser holds the token; the mode decides who spends it on GitHub's API.
      const token = record.mode === "direct" ? record.token : readStoredToken();
      if (!token) {
        setLoggingIn(false);
        return;
      }
      if (record.mode === "direct") {
        setTokenState(token);
      }
      setVerifying(true);
      try {
        const data = await verifyGithub(token, record.mode);
        if (generation !== sessionGeneration.current) return;
        setAccount({ login: data.login });
        setSession({ token: new SensitiveToken(token), mode: record.mode });
        setGithubLoginStatus("success");
        setSessionExpired(false);
      } catch {
        if (generation !== sessionGeneration.current) return;
        setAccount(null);
        setSession(null);
        setSessionExpired(true);
      } finally {
        if (generation === sessionGeneration.current) {
          setVerifying(false);
          setLoggingIn(false);
        }
      }
    }
    init();
    return () => { generationRef.current++; };
  }, [setModeState, setTokenState]);

  // TODO: check if this is still needed
  // Listen for server-side session expiry events
  useEffect(() => {
    const handler = () => {
      sessionGeneration.current++;
      setSessionExpired(true);
      setSession(null);
      setVerifying(false);
      setRedirecting(null);
      setLoggingIn(false);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, handler);
  }, []);

  const login = useCallback(async () => {
    const config = loginConfigRef.current;
    switch (config.mode) {
      case "direct":
        if (!config.token) {
          // TODO: PATerror
          console.error("Missing PAT");
          return;
        }
        break;

      case "backend":
        if (!BACKEND_CONFIGURED) {
          console.error("Backend sign-in needs VITE_API_URL");
          return;
        }
        // No stored token: send the user to GitHub and pick things up in the callback above.
        setRedirecting("login");
        await requestCode();
        return;
    }

    setRedirecting("login");
    setVerifying(true);
    const generation = ++sessionGeneration.current;
    try {
      writeGithubAuthRecord(config);
      setSessionExpired(false);
      const data = await verifyGithub(config.token, "direct");
      if (generation !== sessionGeneration.current) return;
      setAccount({ login: data.login });
      setSession({ token: new SensitiveToken(config.token), mode: "direct" });
      setGithubLoginStatus("success");
      setRedirecting(null);
    } catch {
      if (generation !== sessionGeneration.current) return;
      setAccount(null);
      setSession(null);
      console.error("Login failed");
      setSessionExpired(true);
      setRedirecting(null);
    } finally {
      if (generation === sessionGeneration.current) {
        setVerifying(false);
        setLoggingIn(false);
      }
    }
  }, []);

  // Nothing server-side to end: the token lived here, so dropping it is the whole of signing out.
  const logout = useCallback(async () => {
    sessionGeneration.current++;
    pendingExchange.current = null;
    writeGithubAuthRecord(null);
    clearStoredCredentials();
    setAccount(null);
    setSession(null);
    setSessionExpired(false);
    setVerifying(false);
    setRedirecting(null);
    setLoggingIn(false);
    setTokenState(null);
  }, [setTokenState]);

  const summary = account ? `Signed in as ${account.login}` : "Connect your GitHub account";

  const privateContext: PrivateContext = {
    account,
    loggingIn,
    login,
    logout,
    refresh: login,
    // extra
    sessionExpired,
    redirecting,
    verifying,
    mode,
    setMode: setModeState,
    backendAvailable: BACKEND_CONFIGURED,
    token,
    setToken: setTokenState,
  };
  const [state, dispatchLifecycle] = useReducer(reducer, initialState);
  const lifecycle: GithubLoginV2Lifecycle = deriveLifecycle({ redirecting, verifying, loggingIn, account, sessionExpired });
  if (lifecycle !== state.lifecycle) {
    dispatchLifecycle({ type: "transition", lifecycle });
  }
  useEffect(() => {
    appStore.update(cardId, {
      title: cardTitle,
      currentBaseCardStatus: toBaseCardLifecycle(lifecycle),
      currentStatus: lifecycle,
      githubAccount: account,
      githubToken: session?.token ?? null,
      githubMode: session?.mode ?? null,
    });
  }, [appStore, lifecycle, account, session]);
  const baseCardContext = {
    cardId: cardId,
    title: cardTitle,
    prerequisiteIds: [],
    summary,
    lifecycle: toBaseCardLifecycle(lifecycle),
    stateMachine: { graph: stateGraph, currentState: lifecycle },
  } satisfies BaseCardContext<GithubLoginV2Lifecycle>;
  return {
    baseCardContext,
    privateContext: { ...privateContext, appContext },
  };
}

export type UseGithubLoginV2 = ReturnType<typeof useGithubLoginV2>;
