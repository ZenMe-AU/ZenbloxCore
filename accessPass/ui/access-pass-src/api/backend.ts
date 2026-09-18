import { parse } from "dotenv";
import JSZip from "jszip";
import type { Account, Branch, GhEnv, PullRequest, Repo, WorkflowRun, UpsertSecretResult } from "../types";

const url = import.meta.env.VITE_API_URL;

// ─── Auth ─────────────────────────────────────────────────────────────────────

// Wrapper that auto-refreshes the Easy Auth session on 401.
// On 401: attempt /auth/refresh → retry once. If still 401, redirect to login.
// Not used by verifyAuth (initial check should show login button, not auto-redirect).
async function fetchWithAuth(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = (init.method ?? "GET").toUpperCase() === "POST" ? { "X-CSRF-Token": "1", ...init.headers } : init.headers;
  const res = await fetch(input, { credentials: "include", ...init, headers });
  if (res.status !== 401) return res;

  const refreshed = await fetch(`${url}/auth/refresh`, { credentials: "include" });
  if (refreshed.ok) {
    const retried = await fetch(input, { credentials: "include", ...init, headers });
    if (retried.status !== 401) return retried;
    // Refresh appeared to succeed but API still returns 401 — session is unusable
  }

  window.dispatchEvent(new CustomEvent("auth:session-expired"));
  return res;
}

export async function verifyAuth(): Promise<{ login: string }> {
  const res = await fetch(`${url}/getUser`, { credentials: "include" });
  if (!res.ok) throw new Error("Unauthorized");
  const data = await res.json();
  return data.user;
}

// ─── PKCE auth (used by usePkceAuth — inactive until VITE_AUTH_PKCE=true) ────

export async function exchangePkceCode(code: string, verifier: string, clientId: string, redirectUri: string): Promise<string> {
  const res = await fetch(`${url}/getAccessToken`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, code, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(data.error ?? "Token exchange failed");
  return data.access_token;
}

// ─── Orgs & Repos ─────────────────────────────────────────────────────────────

export async function fetchOrgList(): Promise<Account[]> {
  const [userRes, orgsRes] = await Promise.all([fetchWithAuth(`${url}/getUser`), fetchWithAuth(`${url}/getOrgs`)]);
  if (!userRes.ok) throw new Error(`Failed to fetch user: ${userRes.status}`);
  if (!orgsRes.ok) throw new Error(`Failed to fetch orgs: ${orgsRes.status}`);
  const [userData, orgsData] = await Promise.all([userRes.json(), orgsRes.json()]);
  return [
    { login: userData.user.login, type: "User", id: userData.user.id },
    ...orgsData.orgList.map((o: { login: string; id: number }) => ({ login: o.login, type: "Organization" as const, id: o.id })),
  ];
}

export async function fetchRepos(account: Account): Promise<Repo[]> {
  const params = new URLSearchParams({ owner: account.login, type: account.type });
  const res = await fetchWithAuth(`${url}/getRepos?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch repos: ${res.status}`);
  const data = await res.json();
  return data.repoList || [];
}

// ─── Template ─────────────────────────────────────────────────────────────────

export async function checkTemplate(account: Account, repo: string): Promise<{ isTemplate: boolean; templateName: string }> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetchWithAuth(`${url}/checkTemplate?${params}`);
  if (!res.ok) throw new Error(`Failed to check template: ${res.status}`);
  return res.json();
}

// ─── Repo generation ──────────────────────────────────────────────────────────

export async function generateRepo(
  account: Account,
  targetName: string,
  isPrivate: boolean,
  includeAllBranch: boolean,
  createEnvs: boolean,
  templateRepo?: string,
  validEnvs?: readonly string[],
): Promise<{ repo: Repo; envSuccess: boolean; results: { envs: { name: string; success: boolean; error?: string }[] } }> {
  const res = await fetchWithAuth(`${url}/generateRepo`, {
    method: "POST",
    body: JSON.stringify({
      includeAllBranch,
      isPrivate,
      createEnvs,
      owner: account.login,
      type: account.type,
      repo: targetName,
      templateRepo,
      envNames: validEnvs,
    }),
  });
  if (!res.ok) throw new Error(`Failed to clone repo: ${res.status}`);
  const data = await res.json();
  return { repo: data.data, envSuccess: data.envSuccess, results: data.results };
}

// ─── Branches ─────────────────────────────────────────────────────────────────

export async function fetchBranches(account: Account, repo: string): Promise<Branch[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetchWithAuth(`${url}/getBranches?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch branches: ${res.status}`);
  const data = await res.json();
  return data.branches || [];
}

export async function createBranch(account: Account, repo: string, branchName: string, sourceBranch: string): Promise<Branch> {
  const res = await fetchWithAuth(`${url}/createBranch`, {
    method: "POST",
    body: JSON.stringify({ owner: account.login, type: account.type, repo, branch: branchName, source: sourceBranch }),
  });
  if (!res.ok) throw new Error(`Failed to create branch: ${res.status}`);
  const data = await res.json();
  return data.branch;
}

// ─── Pull Requests ────────────────────────────────────────────────────────────

export async function fetchPullRequests(account: Account, repo: string): Promise<PullRequest[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetchWithAuth(`${url}/getPullRequests?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch pull requests: ${res.status}`);
  const data = await res.json();
  return data.pullRequests || [];
}

// ─── Workflow Runs ────────────────────────────────────────────────────────────

export async function fetchRuns(account: Account, repo: string, headSha: string): Promise<WorkflowRun[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, head_sha: headSha });
  const res = await fetchWithAuth(`${url}/getRuns?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch runs: ${res.status}`);
  const data = await res.json();
  return data.runs || [];
}

// ─── GitHub Environments ──────────────────────────────────────────────────────

export async function fetchEnvs(account: Account, repo: string): Promise<GhEnv[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  const res = await fetchWithAuth(`${url}/getEnvs?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch envs: ${res.status}`);
  const data = await res.json();
  return data.envList || [];
}

// ─── Secrets ──────────────────────────────────────────────────────────────────

export async function fetchSecrets(account: Account, repo: string, envName: string): Promise<string[]> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, env: envName });
  const res = await fetchWithAuth(`${url}/getSecrets?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch secrets: ${res.status}`);
  const data = await res.json();
  return (data.secrets || []) as string[];
}

export async function fetchPublicKey(account: Account, repo: string, envName?: string): Promise<{ key: string; keyId: string }> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type });
  if (envName) params.set("env", envName);
  const res = await fetchWithAuth(`${url}/getPublicKey?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch public key: ${res.status}`);
  const data = await res.json();
  return { key: data.key, keyId: data.keyId };
}

export async function upsertSecret(
  account: Account,
  repo: string,
  name: string,
  encryptedValue: string,
  keyId: string,
  envName?: string,
): Promise<UpsertSecretResult> {
  const res = await fetchWithAuth(`${url}/upsertSecret`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      owner: account.login,
      repo,
      type: account.type,
      name,
      value: encryptedValue,
      keyId,
      ...(envName ? { env: envName } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Failed to upsert secret "${name}": ${res.status}`);
  return res.json();
}

// ─── Variables ────────────────────────────────────────────────────────────────

export async function fetchVariables(account: Account, repo: string, envName: string): Promise<Record<string, string>> {
  const params = new URLSearchParams({ owner: account.login, repo, type: account.type, env: envName });
  const res = await fetchWithAuth(`${url}/getVariables?${params}`);
  if (!res.ok) throw new Error(`Failed to fetch variables: ${res.status}`);
  const data = await res.json();
  return data.variables || {};
}

export async function createVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const res = await fetchWithAuth(`${url}/createVariable`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to create variable "${name}": ${res.status}`);
}

export async function updateVariable(account: Account, repo: string, name: string, value: string, envName: string): Promise<void> {
  const res = await fetchWithAuth(`${url}/updateVariable`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ owner: account.login, repo, name, value, env: envName }),
  });
  if (!res.ok) throw new Error(`Failed to update variable "${name}": ${res.status}`);
}

// ─── Status file ──────────────────────────────────────────────────────────────

export async function fetchStatus(account: Account, repo: string, ref: string): Promise<object | null> {
  const params = new URLSearchParams({
    path: "corpSetup/deploymentChangeset.json",
    owner: account.login,
    repo,
    type: account.type,
    ref,
  });
  const res = await fetchWithAuth(`${url}/getContents?${params}`);
  if (res.status === 404) return null; // file doesn't exist yet — pipeline hasn't run before
  if (!res.ok) throw new Error(`Failed to fetch status: ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.content);
}

// ─── Env ──────────────────────────────────────────────────────────────────────

export async function fetchEnv(account: Account, repo: string): Promise<Record<string, string> | null> {
  const params = new URLSearchParams({ path: "corpSetup/corp.env", owner: account.login, repo, type: account.type });
  const res = await fetchWithAuth(`${url}/getContents?${params}`);
  if (res.status === 404) return null; // file doesn't exist yet
  if (!res.ok) throw new Error(`Failed to fetch env: ${res.status}`);
  const data = await res.json();
  return parse(data.content);
}

export async function getPlanEnv(account: Account, repo: string, envId: number): Promise<Record<string, string> | null> {
  const params = new URLSearchParams({ artifacts_id: String(envId), owner: account.login, type: account.type, repo });
  const res = await fetchWithAuth(`${url}/downloadArtifacts?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const zip = await JSZip.loadAsync(data.content as string, { base64: true });
  const envFile = zip.file("corp.env");
  if (!envFile) return null;
  const content = await envFile.async("string");
  return parse(content);
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

export async function triggerWorkflow(account: Account, repo: string, workflowId: string, githubEnvName: string, ref: string) {
  const res = await fetchWithAuth(`${url}/triggerActions`, {
    method: "POST",
    body: JSON.stringify({
      repo,
      owner: account.login,
      type: account.type,
      workflow_id: workflowId,
      ref,
      github_env_name: githubEnvName,
    }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow: ${res.status}`);
  return res.json();
}

export async function triggerWorkflowFromPR(account: Account, repo: string, workflowId: string, githubEnvName: string, commitSha: string) {
  const res = await fetchWithAuth(`${url}/triggerActions`, {
    method: "POST",
    body: JSON.stringify({
      repo,
      owner: account.login,
      type: account.type,
      workflow_id: workflowId,
      ref: commitSha,
      github_env_name: githubEnvName,
    }),
  });
  if (!res.ok) throw new Error(`Failed to trigger workflow from PR: ${res.status}`);
  return res.json();
}

export async function deployChangeset(account: Account, repo: string, runId: string, dir: string, githubEnvName: string, ref: string) {
  const res = await fetchWithAuth(`${url}/triggerActions`, {
    method: "POST",
    body: JSON.stringify({
      repo,
      owner: account.login,
      type: account.type,
      workflow_id: "deployChangeset.yml",
      ref,
      github_env_name: githubEnvName,
      run_id: runId,
      dir,
    }),
  });
  if (!res.ok) throw new Error(`Failed to trigger deploy: ${res.status}`);
  return res.json();
}

// ─── Deploy error (from artifact log) ────────────────────────────────────────

export async function fetchDeployLog(account: Account, repo: string, logId: number): Promise<string | null> {
  const params = new URLSearchParams({ artifacts_id: String(logId), owner: account.login, type: account.type, repo });
  const res = await fetchWithAuth(`${url}/downloadArtifacts?${params}`);
  if (!res.ok) return null;
  const data = await res.json();
  const zip = await JSZip.loadAsync(data.content as string, { base64: true });
  const logFile = Object.values(zip.files).find((f) => !f.dir);
  if (!logFile) return null;
  return logFile.async("string");
}

// ─── Plan (artifact) ──────────────────────────────────────────────────────────

export async function fetchPlan(id: string, account: { login: string; type: string }, repo: string) {
  const params = new URLSearchParams({ artifacts_id: id, owner: account.login, type: account.type, repo, ref: "dev" });
  const res = await fetchWithAuth(`${url}/downloadArtifacts?${params.toString()}`);
  if (!res.ok) throw new Error(`Failed to fetch plan for ${id}`);
  const data = await res.json();
  const zip = await JSZip.loadAsync(data.content as string, { base64: true });
  const fileName = Object.keys(zip.files).find((f) => f.endsWith(".json"));
  if (!fileName) throw new Error("No JSON file found in artifact zip");
  const content = await zip.file(fileName)!.async("string");
  return JSON.parse(content);
}
