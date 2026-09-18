import { PublicClientApplication } from "@azure/msal-browser";
import { AZURE_CLIENT_ID } from "../config/azureConfig";

let _msal: PublicClientApplication | null = null;
let _initialized = false;

export async function getMsal(): Promise<PublicClientApplication | null> {
  if (!AZURE_CLIENT_ID) return null;
  if (!_msal) {
    _msal = new PublicClientApplication({
      auth: {
        clientId: AZURE_CLIENT_ID,
        authority: "https://login.microsoftonline.com/common",
        redirectUri: window.location.origin,
      },
      cache: { cacheLocation: "sessionStorage" },
    });
  }
  if (!_initialized) {
    await _msal.initialize();
    _initialized = true;
  }
  return _msal;
}

