/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { parse } from "dotenv";
import JSZip from "jszip";
import type { Account, StageReport } from "../../types";
import { ARM_SCOPES } from "../../config/azureConfig";
import { GITHUB_TOKEN_KEYS } from "../../config/githubConfig";
import { REMOTE_TERMINAL_TTL_SECONDS } from "../../config/remoteTerminal";
import { requireMsToken } from "../../auth/msal";
import { readBlobWithProgress } from "../../logic/download";
import { getStoredToken } from "../../logic/tokenStore";
import { toStageReport } from "../../logic/stage";
import type { SessionCredentials } from "../../logic/remoteTerminal";

const GH = "https://api.github.com";
const url = import.meta.env.VITE_API_URL;
const terminalUrl = import.meta.env.VITE_TERMINAL_API_URL || url;
const MS_AUTHED = { msScopes: ARM_SCOPES };
const AUTH_RECORD_KEY = "zeninstaller_github_auth";

type GithubAuthRecord = { mode: "direct"; token: string } | { mode: "backend" };
type RemoteLoginDispatch = {
  workflowId: string;
  githubEnvName: string;
  ref: string;
  sessionId: string;
  dir: string;
  planRunId?: string;
};
type AuthedInit = RequestInit & { msScopes?: string[] };

function getDirectToken(): string | null {
  const raw = sessionStorage.getItem(AUTH_RECORD_KEY);
  if (!raw) return null;
  try {
    const record = JSON.parse(raw) as GithubAuthRecord;
    return record.mode === "direct" ? record.token : null;
  } catch {
    return null;
  }
}

function getGithubToken(): string | null {
  return getDirectToken() ?? getStoredToken(GITHUB_TOKEN_KEYS);
}

async function fetchWithAuth(input: string, init: AuthedInit = {}): Promise<Response> {
  const { msScopes, ...requestInit } = init;
  const token = getGithubToken();
  const headers: Record<string, string> = {
    ...((requestInit.headers as Record<string, string>) ?? {}),
    ...(token ? { "Zb.Github.Authorization": `Bearer ${token}` } : {}),
    ...(msScopes ? { "Zb.Msal.Authorization": `Bearer ${await requireMsToken(msScopes)}` } : {}),
    ...((requestInit.method ?? "GET").toUpperCase() === "POST" ? { "X-CSRF-Token": "1" } : {}),
  };
  const res = await fetch(input, { ...requestInit, headers });
  if (res.status === 401 && !msScopes) window.dispatchEvent(new CustomEvent("auth:session-expired"));
  return res;
}

function githubHeaders(token: string, write = false): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(write ? { "Content-Type": "application/json" } : {}),
  };
}

async function fetchGithub(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const isWrite = ["POST", "PUT", "PATCH", "DELETE"].includes((init.method ?? "GET").toUpperCase());
  return fetch(`${GH}${path}`, {
    ...init,
    headers: { ...githubHeaders(token, isWrite), ...init.headers },
  });
}

async function downloadGithubZip(token: string, account: Account, repo: string, artifactId: number): Promise<JSZip> {
  const res = await fetchGithub(token, `/repos/${account.login}/${repo}/actions/artifacts/${artifactId}/zip`);
  if (!res.ok) throw new Error(`Failed to download the package: ${res.status}`);
  return JSZip.loadAsync(await readBlobWithProgress(res));
}

async function downloadBackendZip(account: Account, repo: string, artifactId: string | number): Promise<JSZip> {
  const params = new URLSearchParams({
    artifacts_id: String(artifactId),
    owner: account.login,
    type: account.type,
    repo,
  });
  const res = await fetchWithAuth(`${url}/downloadArtifacts?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch plan for ${artifactId}`);
  const data = await res.json();
  return JSZip.loadAsync(data.content as string, { base64: true });
}

export async function createVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const token = getDirectToken();
  if (token) {
    const res = await fetchGithub(token, `/repos/${account.login}/${repo}/environments/${encodeURIComponent(envName)}/variables`, {
      method: "POST",
      body: JSON.stringify({ name, value }),
    });
    if (!res.ok) throw new Error(`Failed to create variable "${name}": ${res.status}`);
    return;
  }
  const res = await fetchWithAuth(`${url}/createVariable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to create variable "${name}": ${res.status}`);
}

export async function updateVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const token = getDirectToken();
  if (token) {
    const res = await fetchGithub(token, `/repos/${account.login}/${repo}/environments/${encodeURIComponent(envName)}/variables/${name}`, {
      method: "PATCH",
      body: JSON.stringify({ name, value }),
    });
    if (!res.ok) throw new Error(`Failed to update variable "${name}": ${res.status}`);
    return;
  }
  const res = await fetchWithAuth(`${url}/updateVariable`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to update variable "${name}": ${res.status}`);
}

export async function fetchStageReport(
  account: Account,
  repo: string,
  envName: string,
  dir: string,
  kind: "plan" | "deploy" | "build",
): Promise<StageReport | null> {
  const token = getDirectToken();
  if (token) {
    const params = new URLSearchParams({ environment: envName, task: `${kind}:${dir}`, per_page: "1" });
    const res = await fetchGithub(token, `/repos/${account.login}/${repo}/deployments?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch the report for "${dir}": ${res.status}`);
    const [latest] = (await res.json()) as { payload: unknown; created_at: string; sha?: string }[];
    return latest ? toStageReport(latest.payload, latest.created_at, latest.sha) : null;
  }

  const params = new URLSearchParams({
    owner: account.login,
    repo,
    environment: envName,
    task: `${kind}:${dir}`,
    per_page: "1",
  });
  const res = await fetchWithAuth(`${url}/getDeployments?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch the report for "${dir}": ${res.status}`);
  const { deployments } = await res.json();
  const latest = deployments?.[0];
  return latest ? toStageReport(latest.payload, latest.created_at, latest.sha) : null;
}

export async function getPlanEnv(account: Account, repo: string, envId: number): Promise<Record<string, string> | null> {
  try {
    const token = getDirectToken();
    const zip = token
      ? await downloadGithubZip(token, account, repo, envId)
      : await downloadBackendZip(account, repo, envId);
    const file = zip.file("corp.env");
    return file ? parse(await file.async("string")) : null;
  } catch {
    return null;
  }
}

export async function fetchLogArtifact(account: Account, repo: string, logId: number): Promise<string | null> {
  try {
    const token = getDirectToken();
    const zip = token
      ? await downloadGithubZip(token, account, repo, logId)
      : await downloadBackendZip(account, repo, logId);
    const file = Object.values(zip.files).find((entry) => !entry.dir);
    return file ? file.async("string") : null;
  } catch {
    return null;
  }
}

export async function fetchPlan(id: string, account: Account, repo: string) {
  const token = getDirectToken();
  let zip: JSZip;
  if (token) {
    zip = await downloadGithubZip(token, account, repo, Number(id));
  } else {
    const params = new URLSearchParams({
      artifacts_id: id,
      owner: account.login,
      type: account.type,
      repo,
      ref: "dev",
    });
    const res = await fetchWithAuth(`${url}/downloadArtifacts?${params}`);
    if (!res.ok) throw new Error(`Failed to fetch plan for ${id}`);
    const data = await res.json();
    zip = await JSZip.loadAsync(data.content as string, { base64: true });
  }
  const fileName = Object.keys(zip.files).find((file) => file.endsWith(".json"));
  if (!fileName) throw new Error("No JSON file found in artifact zip");
  return JSON.parse(await zip.file(fileName)!.async("string"));
}

export async function triggerWorkflow(
  account: Account,
  repo: string,
  workflowId: string,
  githubEnvName: string,
  ref: string,
  dir?: string,
): Promise<void> {
  const token = getDirectToken();
  if (token) {
    const res = await fetchGithub(token, `/repos/${account.login}/${repo}/actions/workflows/${workflowId}/dispatches`, {
      method: "POST",
      body: JSON.stringify({ ref, inputs: { github_env_name: githubEnvName, dir } }),
    });
    if (res.status === 404) throw new Error(`Build workflow for ${workflowId} is not found.`);
    if (!res.ok) throw new Error(`Failed to trigger workflow: ${res.status}`);
    return;
  }
  const res = await fetchWithAuth(`${url}/triggerActions`, {
    method: "POST",
    body: JSON.stringify({
      repo,
      owner: account.login,
      type: account.type,
      workflow_id: workflowId,
      ref,
      github_env_name: githubEnvName,
      dir,
    }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow: ${res.status}`);
}

export async function triggerRemoteLogin(account: Account, repo: string, opts: RemoteLoginDispatch): Promise<void> {
  const token = getDirectToken();
  if (token) {
    const res = await fetchGithub(token, `/repos/${account.login}/${repo}/actions/workflows/${opts.workflowId}/dispatches`, {
      method: "POST",
      body: JSON.stringify({
        ref: opts.ref,
        inputs: {
          github_env_name: opts.githubEnvName,
          session_id: opts.sessionId,
          dir: opts.dir,
          plan_run_id: opts.planRunId,
        },
      }),
    });
    if (!res.ok) throw new Error(`Failed to start the remote login workflow: ${res.status}`);
    return;
  }
  const res = await fetchWithAuth(`${url}/triggerActions`, {
    method: "POST",
    body: JSON.stringify({
      repo,
      owner: account.login,
      type: account.type,
      workflow_id: opts.workflowId,
      ref: opts.ref,
      github_env_name: opts.githubEnvName,
      session_id: opts.sessionId,
      dir: opts.dir,
      plan_run_id: opts.planRunId,
    }),
  });
  if (!res.ok) throw new Error(`Failed to start the remote login workflow: ${res.status}`);
}

export async function registerSession({ sessionId, accessToken }: SessionCredentials): Promise<void> {
  const res = await fetchWithAuth(`${terminalUrl}/terminal/register`, {
    ...MS_AUTHED,
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, accessToken, ttlSeconds: REMOTE_TERMINAL_TTL_SECONDS }),
  });
  if (!res.ok) throw new Error(`Failed to register the terminal session: ${res.status}`);
}

export async function negotiateSession({ sessionId, accessToken }: SessionCredentials): Promise<string> {
  const params = new URLSearchParams({ session: sessionId, token: accessToken });
  const res = await fetchWithAuth(`${terminalUrl}/terminal/negotiate?${params}`, { ...MS_AUTHED, method: "POST" });
  if (!res.ok) throw new Error(`Failed to negotiate the terminal session: ${res.status}`);
  const data = await res.json();
  const clientUrl = typeof data.url === "string" ? data.url : data.url?.url;
  if (typeof clientUrl !== "string") throw new Error("Unexpected negotiate response");
  return clientUrl;
}

export async function deleteSession(sessionId: string): Promise<void> {
  try {
    await fetchWithAuth(`${terminalUrl}/terminal/session/${sessionId}`, { ...MS_AUTHED, method: "DELETE" });
  } catch {
    // The session row expires automatically if cleanup fails.
  }
}
