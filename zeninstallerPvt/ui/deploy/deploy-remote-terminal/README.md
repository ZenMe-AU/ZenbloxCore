# deploy-remote-terminal

Terraform for the infrastructure behind the stage card's remote terminal: the Web PubSub relay the
browser and the GitHub runner meet on, the storage account holding session state, and the Function
App serving `register` / `negotiate` / `session` / `health`.

Laid out the same way as [`../deploy`](../deploy) — `.env` drives `scripts/genTfVars.js`, which
writes `env/terraform.auto.tfvars.json`, which Terraform picks up automatically. Resource names are
derived from `TARGET_ENV`, so there is one knob rather than eight.

Infrastructure only. The Function App's **code** currently lives in the `azure-remote-login` repo
and is due to move into `zeninstaller/backend`.

## Usage

```bash
cp .env.example .env   # fill in SUBSCRIPTION_ID and ALLOWED_ORIGINS
pnpm install
pnpm run tf
pnpm run out
```

## Everything connects by managed identity

There is no access key and no connection string in `app_settings`. The Function App's
system-assigned identity holds every data-plane role it needs:

| Role                                          | Scope                | For                                      |
| --------------------------------------------- | -------------------- | ---------------------------------------- |
| Storage Blob / Queue / Table Data Contributor | Storage account      | Functions runtime, and the session table |
| Web PubSub Service Owner                      | Web PubSub           | Issuing group-scoped client tokens       |
| Monitoring Metrics Publisher                  | Application Insights | Telemetry via AAD                        |

Service _Owner_, not Service _Reader_: issuing a client token is a POST, and Reader grants
`Microsoft.SignalRService/WebPubSub/*/read` only.

### The code contract this expects

**The backend as it stands today will not run against this.** It reads a connection string and an
access key, so all four endpoints return 500 until it is updated:

```js
TableClient.fromConnectionString(SESSION_TABLE_CONNECTION_STRING, SESSION_TABLE_NAME);
new WebPubSubServiceClient(`https://${ENDPOINT}`, { key: WEBPUBSUB_KEY }, HUB);
```

What this Terraform provides instead:

| Setting                     | Value                                       |
| --------------------------- | ------------------------------------------- |
| `SESSION_TABLE_ACCOUNT_URL` | `https://<account>.table.core.windows.net/` |
| `SESSION_TABLE_NAME`        | `sessions`                                  |
| `WEBPUBSUB_ENDPOINT`        | bare hostname                               |
| `HUB_NAME`                  | `terminal`                                  |

So the migrated backend should construct both clients with a `DefaultAzureCredential` and add
`@azure/identity` as a dependency.

One behaviour change worth knowing: with an access key, `getClientAccessToken()` signs a JWT locally
and touches the network zero times. With AAD it calls the service's `:generateToken` API — one more
round trip, but a misconfigured role then fails loudly at `negotiate` instead of surfacing later as a
WebSocket connection error.

## Where the outputs go

| Output                | Goes to                                                                              |
| --------------------- | ------------------------------------------------------------------------------------ |
| `remote_terminal_api` | `VITE_REMOTE_TERMINAL_API` in `web/.env`                                             |
| `web_pubsub_endpoint` | `WEBPUBSUB_ENDPOINT` variable on the pipeline repo                                   |
| `web_pubsub_hub`      | `HUB_NAME` variable on the pipeline repo                                             |
| `web_pubsub_key`      | `WEBPUBSUB_KEY` secret on the pipeline repo (`terraform output -raw web_pubsub_key`) |
| `web_pubsub_id`       | Resource id of the Web PubSub instance                                               |
| `pipeline_client_id`  | `WEBPUBSUB_CLIENT_ID` variable on the pipeline repo                                  |
| `pipeline_tenant_id`  | `WEBPUBSUB_TENANT_ID` variable on the pipeline repo                                  |

`web_pubsub_key` is the fallback, not the intended path — see below.

## Retiring the Web PubSub key

This also provisions an app registration for the pipeline repo, so GitHub Actions can reach Web
PubSub through federated OIDC instead of a shared access key. It gets `Web PubSub Service Owner` on
the Web PubSub resource and one federated credential per GitHub environment.

Set `pipeline_client_id` and `pipeline_tenant_id` as `WEBPUBSUB_CLIENT_ID` / `WEBPUBSUB_TENANT_ID`
variables on the pipeline repo, switch its agent to `AzureCliCredential` behind an `azure/login`
step, and the `WEBPUBSUB_KEY` secret can be deleted.

`GITHUB_OIDC_SUBJECTS` has no default on purpose. The pipeline repo opts into immutable OIDC
subjects, so the `sub` claim is not always `repo:OWNER/NAME:environment:ENV`, and a wrong value
produces a principal that authenticates against nothing. Read the real format off an existing
credential:

```bash
az ad app federated-credential list --id <existing-AZURE_CLIENT_ID> -o json
```

Creating the app registration needs permission to register applications in the tenant, which is a
higher bar than the rest of this stack.

`web_pubsub_endpoint` is a bare hostname on purpose. Callers build `https://<host>` from it, so a
value carrying `wss://` or `https://` produces `https://wss://host` and DNS is asked to resolve
`wss`.

`ALLOWED_ORIGINS` is not optional in practice: the browser calls `/register` and `/negotiate`
itself, so its origin must be in the Function App's CORS list or every session fails to start.

## Differences from `../deploy`

Same shape — Flex Consumption `FC1`, system-assigned identity, Log Analytics + Application Insights.
Two deliberate departures:

- **No Key Vault.** `../deploy` keeps its OAuth secret there. Here every connection uses managed
  identity, so there is no secret to store and an empty vault would only be a name to maintain. Add
  one the day something genuinely needs to be secret.
- **No Easy Auth.** Every backend endpoint is anonymous by design — the session access token is what
  authorises `/negotiate`, not a platform login.

There is also no static website. `deploy-infra.sh` in `azure-remote-login` enables one to host a
standalone xterm page; the stage card replaced it, so the storage account here serves only the
session table and the Function App's deployment container.

## When the backend moves into ZenInstaller

`../deploy` has no platform login either — it authenticates in the handler with `requireAuth` — so
these endpoints could live in the existing ZenInstaller Function App. If they do, the Function App,
service plan and storage account here become redundant and only the Web PubSub needs to survive.
