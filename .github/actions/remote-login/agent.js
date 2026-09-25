/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

/**
 * Joins a terminal session the browser already registered, then runs the Azure device login.
 *
 * Trimmed from azure-remote-login/runner/agent.js: the session id arrives as a workflow input so
 * nothing is registered here, the access token stays in the browser, and the run stops once
 * `az login --use-device-code` finishes — no Terraform stage.
 */

import { execFileSync } from "child_process";
import pty from "node-pty";
import { WebSocket } from "ws";
import { DeviceCodeDetector } from "./device-code.js";

const SESSION_ID = process.env.SESSION_ID;
const CLIENT_URL = process.env.WEBPUBSUB_CLIENT_URL;
const TENANT_ID = process.env.AZURE_TENANT_ID?.trim();
const SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID?.trim();
const AWS_LOGIN = process.env.AWS_LOGIN?.trim() !== "false";
const AWS_REGION = process.env.AWS_REGION?.trim() || "us-east-1";
const SESSION_TTL = parseInt(process.env.SESSION_TTL || "1800", 10);
const COLS = 120;
const ROWS = 24;

if (!SESSION_ID) {
  console.error("FATAL: SESSION_ID env var required");
  process.exit(1);
}
if (!CLIENT_URL) {
  console.error("FATAL: WEBPUBSUB_CLIENT_URL env var required — mint-webpubsub-token.js runs before this");
  process.exit(1);
}

async function getClientUrl() {
  const client = new WebPubSubServiceClient(`https://${ENDPOINT}`, { key: KEY }, HUB);
  const token = await client.getClientAccessToken({
    userId: `runner-${crypto.randomUUID()}`,
    roles: [`webpubsub.joinLeaveGroup.${SESSION_ID}`, `webpubsub.sendToGroup.${SESSION_ID}`],
    expiresInMinutes: Math.ceil(SESSION_TTL / 60),
  });
  if (typeof token === "string") return token;
  if (typeof token.url === "string") return token.url;
  if (typeof token.url?.url === "string") return token.url.url;
  throw new Error(`Unexpected getClientAccessToken response: ${JSON.stringify(token)}`);
}

async function main() {
  console.log(`Joining terminal session ${SESSION_ID}`);
  const ws = new WebSocket(CLIENT_URL, "json.webpubsub.azure.v1");
  let child = null;
  let joined = false;
  let finished = false;
  let detached = false;
  let loginExitCode = 1;

  const send = (message) => {
    if (ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        type: "sendToGroup",
        group: SESSION_ID,
        dataType: "text",
        noEcho: true,
        data: JSON.stringify(message),
      })
    );
  };

  function finish() {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    const code = loginExitCode === 0 ? 0 : 1;
    if (child) child.kill();
    send({ type: "sessionClosed", ok: code === 0 });
    console.log(`Remote login ${code === 0 ? "SUCCESS" : "FAILED"}`);
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) ws.close();
      process.exit(code);
    }, 500);
  }

  function selectSubscription() {
    if (!SUBSCRIPTION_ID) {
      const warning = "AZURE_SUBSCRIPTION_ID is not set — staying on whichever subscription az defaulted to";
      console.log(`::warning::${warning}`);
      send({ type: "terminal", data: `\r\n${warning}\r\n` });
      return true;
    }
    try {
      execFileSync("az", ["account", "set", "--subscription", SUBSCRIPTION_ID], { stdio: "pipe" });
      const name = execFileSync("az", ["account", "show", "--query", "name", "-o", "tsv"], { encoding: "utf8" }).trim();
      console.log(`Subscription set to ${name} (${SUBSCRIPTION_ID})`);
      send({ type: "terminal", data: `\r\nSubscription set to ${name}\r\n` });
      return true;
    } catch (err) {
      const detail = err.stderr?.toString().trim() || err.message;
      console.error(`::error::Could not select subscription ${SUBSCRIPTION_ID}: ${detail}`);
      send({ type: "terminal", data: `\r\nCould not select subscription ${SUBSCRIPTION_ID}\r\n${detail}\r\n` });
      return false;
    }
  }

  // Both logins share the PTY plumbing and the streaming; only the command and the cloud differ.
  function runLogin({ cloud, command, args, env, onSuccess }) {
    console.log(`Starting: ${command} ${args.join(" ")}`);
    const detector = new DeviceCodeDetector(cloud);
    detector.on("deviceCode", ({ url, code }) => {
      console.log(`::notice::${cloud} device code ${code} — sign in at ${url}`);
      send({ type: "deviceCode", cloud, url, code });
    });

    child = pty.spawn(command, args, { cols: COLS, rows: ROWS, cwd: process.cwd(), env: env ?? process.env });

    child.onData((data) => {
      process.stdout.write(data);
      send({ type: "terminal", data });
      detector.feed(data);
    });

    child.onExit(({ exitCode }) => {
      if (finished) return;
      if (exitCode !== 0) {
        loginExitCode = exitCode;
        send({ type: "loginFailed", cloud, exitCode });
        send({ type: "stage", stage: "error" });
        setTimeout(finish, 1000);
        return;
      }
      onSuccess();
    });
  }

  function fail(cloud, exitCode) {
    loginExitCode = exitCode;
    send({ type: "loginFailed", cloud, exitCode });
    send({ type: "stage", stage: "error" });
    setTimeout(finish, 1000);
  }

  function succeed() {
    loginExitCode = 0;
    send({ type: "stage", stage: "done" });
    setTimeout(finish, 1000);
  }

  function startAzLogin() {
    send({ type: "stage", stage: "azure-login" });

    // Scoping the login itself beats switching afterwards: the device code is issued by this tenant.
    const args = ["login", "--use-device-code"];
    if (TENANT_ID) args.push("--tenant", TENANT_ID);
    else console.log("::warning::AZURE_TENANT_ID is not set — signing in to the account's home tenant");

    runLogin({
      cloud: "azure",
      command: "az",
      args,
      onSuccess: () => {
        if (!selectSubscription()) return fail("azure", 1);
        send({ type: "loginCompleted", cloud: "azure" });
        startAwsLogin();
      },
    });
  }

  // `aws login --remote` prints a console sign-in URL and waits for the code pasted back.
  function startAwsLogin() {
    if (!AWS_LOGIN) {
      console.log("AWS_LOGIN=false — finishing after the Azure sign-in");
      return succeed();
    }

    send({ type: "stage", stage: "aws-login" });
    runLogin({
      cloud: "aws",
      command: "aws",
      args: ["login", "--remote"],
      env: { ...process.env, AWS_DEFAULT_REGION: AWS_REGION },
      onSuccess: () => {
        send({ type: "loginCompleted", cloud: "aws" });
        succeed();
      },
    });
  }

  const deadline = setTimeout(() => {
    console.error(`::error::No sign-in completed within ${SESSION_TTL}s — giving up.`);
    send({ type: "terminal", data: `\r\nSession timed out after ${SESSION_TTL}s.\r\n` });
    send({ type: "stage", stage: "error" });
    loginExitCode = 1;
    setTimeout(finish, 500);
  }, SESSION_TTL * 1000);

  ws.on("message", (raw) => {
    let frame;
    try {
      frame = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (frame.type === "system" && frame.event === "connected") {
      ws.send(JSON.stringify({ type: "joinGroup", group: SESSION_ID, ackId: 1 }));
      return;
    }

    if (frame.type === "ack") {
      if (!frame.success) {
        console.error("::error::Could not join the session group");
        process.exit(1);
      }
      if (!joined) {
        joined = true;
        console.log("Joined the session group, starting az login");
        startAzLogin();
      }
      return;
    }

    if (frame.type !== "message" || frame.group !== SESSION_ID) return;
    let payload;
    try {
      payload = JSON.parse(frame.data);
    } catch {
      if (child) child.write(String(frame.data));
      return;
    }

    if (payload.type === "endSession") {
      console.log("Browser ended the session — detaching the terminal, the sign-in keeps running");
      detached = true;
      ws.close();
      return;
    }

    if (!child) return;
    if (payload.type === "input") child.write(payload.data);
    else if (payload.type === "resize") child.resize(payload.cols || COLS, payload.rows || ROWS);
  });

  ws.on("error", (err) => console.error("WebSocket error:", err.message));
  ws.on("close", () => {
    if (!detached) finish();
  });

  process.on("SIGTERM", finish);
  process.on("SIGINT", finish);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
