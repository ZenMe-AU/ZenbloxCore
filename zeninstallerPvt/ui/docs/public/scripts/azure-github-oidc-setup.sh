#!/bin/bash
set -euo pipefail

# ══════════════════════════════════════════════════════════════════════════════
# Configuration — edit these values before running
# ══════════════════════════════════════════════════════════════════════════════
APP_NAME="github-actions-deployer"     # Display name for the app registration
GITHUB_ORG="my-org"                    # GitHub org or username
GITHUB_REPO="ZBCorpArchitecture"       # Repository name
ENVIRONMENTS=("PROD" "TEST")           # GitHub Environments (one federated credential each)
# ══════════════════════════════════════════════════════════════════════════════

SUBSCRIPTION_ID=$(az account show --query id -o tsv)
TENANT_ID=$(az account show --query tenantId -o tsv)
APP_ID=""

# Print ZenInstaller values on exit if the app was created
trap '
  if [[ -n "$APP_ID" ]]; then
    echo ""
    echo "====== Copy these into ZenInstaller ======"
    echo "AZURE_CLIENT_ID:       $APP_ID"
    echo "AZURE_TENANT_ID:       $TENANT_ID"
    echo "AZURE_SUBSCRIPTION_ID: $SUBSCRIPTION_ID"
  fi
' EXIT

# ── 1. Create app registration (skip if already exists) ───────────────────────
echo "Checking app registration..."
EXISTING_APP_ID=$(az ad app list --display-name "$APP_NAME" --query "[0].appId" -o tsv)

if [[ -n "$EXISTING_APP_ID" ]]; then
  echo "  App already exists: $EXISTING_APP_ID"
  APP_ID="$EXISTING_APP_ID"
  APP_OBJECT_ID=$(az ad app show --id "$APP_ID" --query id -o tsv)
else
  echo "  Creating app registration..."
  APP=$(az ad app create \
    --display-name "$APP_NAME" \
    --sign-in-audience AzureADMyOrg \
    --required-resource-accesses '[{"resourceAppId":"00000003-0000-0000-c000-000000000000","resourceAccess":[{"id":"62a82d76-70ea-41e2-9197-370581804d09","type":"Role"},{"id":"dbaae8cf-10b5-4b86-a4a1-f871c94c6695","type":"Role"},{"id":"741f803b-c850-494e-b5df-cde7c675a1ca","type":"Role"},{"id":"1bfefb4e-e0b5-418b-a88f-73c46d2cc8e9","type":"Role"},{"id":"06b708a9-e830-4db3-a914-8e69da51d44f","type":"Role"},{"id":"9e3f62cf-ca93-4989-b6ce-bf83c28f9fe8","type":"Role"},{"id":"29c18626-4985-4dcd-85c0-193eef327366","type":"Role"},{"id":"2f6817f8-7b12-4f0f-bc18-eeaf60705a9e","type":"Role"},{"id":"50483e42-d915-4231-9639-7fdb7fd190e5","type":"Role"}]}]' \
    -o json)
  APP_ID=$(echo "$APP" | jq -r '.appId')
  APP_OBJECT_ID=$(echo "$APP" | jq -r '.id')
  echo "  Created: $APP_ID"
fi

# ── 2. Create service principal (skip if already exists) ──────────────────────
echo "Checking service principal..."
EXISTING_SP_ID=$(az ad sp list --filter "appId eq '$APP_ID'" --query "[0].id" -o tsv)

if [[ -n "$EXISTING_SP_ID" ]]; then
  echo "  Service principal already exists: $EXISTING_SP_ID"
  SP_OBJECT_ID="$EXISTING_SP_ID"
else
  echo "  Creating service principal..."
  SP=$(az ad sp create --id "$APP_ID" -o json)
  SP_OBJECT_ID=$(echo "$SP" | jq -r '.id')
  echo "  Created: $SP_OBJECT_ID"
fi

# ── 3. Add federated credentials (skip existing ones) ─────────────────────────
for ENV in "${ENVIRONMENTS[@]}"; do
  CRED_NAME="github-${ENV,,}"
  EXISTING_CRED=$(az ad app federated-credential list --id "$APP_OBJECT_ID" \
    --query "[?name=='$CRED_NAME'].id" -o tsv)

  if [[ -n "$EXISTING_CRED" ]]; then
    echo "  Federated credential '$CRED_NAME' already exists, skipping"
  else
    echo "  Adding federated credential for environment: $ENV"
    az ad app federated-credential create \
      --id "$APP_OBJECT_ID" \
      --parameters "{
        \"name\": \"$CRED_NAME\",
        \"issuer\": \"https://token.actions.githubusercontent.com\",
        \"subject\": \"repo:${GITHUB_ORG}/${GITHUB_REPO}:environment:${ENV}\",
        \"audiences\": [\"api://AzureADTokenExchange\"]
      }"
  fi
done

# ── 4. Assign RBAC roles (skip existing assignments) ─────────────────────────
SCOPE="/subscriptions/$SUBSCRIPTION_ID"
for ROLE in "Contributor" "User Access Administrator"; do
  EXISTING_ASSIGNMENT=$(az role assignment list \
    --role "$ROLE" \
    --assignee "$SP_OBJECT_ID" \
    --scope "$SCOPE" \
    --query "[0].id" -o tsv)

  if [[ -n "$EXISTING_ASSIGNMENT" ]]; then
    echo "  Role '$ROLE' already assigned, skipping"
  else
    echo "  Assigning role: $ROLE"
    az role assignment create \
      --role "$ROLE" \
      --assignee-object-id "$SP_OBJECT_ID" \
      --assignee-principal-type ServicePrincipal \
      --scope "$SCOPE"
  fi
done

# ── 5. Grant admin consent ────────────────────────────────────────────────────
echo "Granting admin consent..."
if ! az ad app permission admin-consent --id "$APP_ID" 2>/dev/null; then
  echo ""
  echo "  ⚠ Admin consent via CLI failed."
  echo "  Grant it manually in the portal:"
  echo "  Entra ID → App registrations → $APP_NAME → API permissions → Grant admin consent"
fi

echo "Done."
