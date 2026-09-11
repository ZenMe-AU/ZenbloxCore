# Access Pass Azure Function Backend

This backend is an Azure Function App that uses an app registration (service principal) to call Microsoft Graph with application permissions.

## Endpoint

- POST /api/access-pass/bootstrap-groups

Request body:

{
"tenantId": "<tenant-guid>",
"managerUserId": "<manager-object-id>",
"targetUserId": "<target-user-object-id>"
}

Behavior:

- Adds managerUserId to ACCESS_PASS_RESET_MANAGERS_GROUP_NAME
- Adds targetUserId to ACCESS_PASS_RESET_TARGET_USERS_GROUP_NAME

## Required Microsoft Graph application permissions

- Group.Read.All
- GroupMember.ReadWrite.All

Grant admin consent for these permissions.

## Local run

1. Copy local.settings.json.example to local.settings.json and fill values.
2. Install dependencies in this folder.
3. Run: pnpm start

Optional local CORS setting:

- ACCESS_PASS_ALLOWED_ORIGIN (default: *)

The frontend should use VITE_API_URL=http://localhost:7071.
