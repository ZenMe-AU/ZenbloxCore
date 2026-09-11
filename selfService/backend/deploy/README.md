# SelfService Deploy Directory

This directory contains scripts for deploying and managing Azure AD app registrations for the selfService application.

## Overview

The deployment process handles:

- Creating a new Azure AD app registration in the specified tenant
- Updating the app registration if it already exists
- Storing the app registration details (Client ID) in the `.env` file

## Structure

```
deploy/
├── deployModule.ps1          # Main PowerShell entry point
└── code/
    └── appRegistration.mjs   # App registration deployment logic
```

## Prerequisites

- PowerShell 5.1 or later
- Azure CLI installed and authenticated (`az login`)
- Node.js and pnpm (for running Node scripts)
- `.env` file in the `selfService/web` directory with `VITE_AZURE_TENANT_ID` set

## Usage

### Running the Deployment

```powershell
# From the deploy directory, using default .env location (../../web/.env)
.\deployModule.ps1

# Or specify a custom .env file path
.\deployModule.ps1 -envFile "path/to/.env"
```

### What Happens

1. **Dependencies**: Installs Node dependencies via pnpm
2. **Azure Authentication**: Sets the Azure CLI context to the specified tenant
3. **App Registration Check**:
   - If `VITE_AZURE_CLIENT_ID` is in `.env`, verifies the app registration exists
   - If not present, creates a new app registration named "selfService"
4. **.env Update**: If a new app registration was created, updates `.env` with the new `VITE_AZURE_CLIENT_ID`

## Environment Variables

### Input (.env)

- `VITE_AZURE_TENANT_ID`: The Azure tenant ID where the app registration will be created

### Output (.env)

- `VITE_AZURE_CLIENT_ID`: The Azure AD application (client) ID, created or verified during deployment

## Example .env

```dotenv
VITE_AZURE_TENANT_ID=ccd8ce7c-2096-44b4-9688-7a8fd231e7cb
VITE_AZURE_CLIENT_ID=86bfe2a0-093f-4e3c-ac79-0ad2a500b815
VITE_API_URL=http://localhost:7071
```

## Troubleshooting

### "Could not retrieve Azure subscription ID"

- Run `az login` to authenticate with Azure CLI
- Ensure you have access to the specified tenant

### "Environment file not found"

- Verify the path to `.env` file exists
- Default path is `../../web/.env` from the deploy directory

### App Registration Creation Fails

- Ensure you have permissions to create app registrations in the tenant
- Check that `VITE_AZURE_TENANT_ID` is a valid tenant ID

## Notes

- The app registration is created with `AzureADMyOrg` audience (single tenant)
- Only the `VITE_AZURE_CLIENT_ID` is updated in `.env` during creation
- Other environment variables must be set manually if needed
