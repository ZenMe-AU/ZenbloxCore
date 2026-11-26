/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { GraphAuthMethod } from "../api/azureGraph";
import type { SetupStep } from "../types";

export type AccessPassResult = { accessPassValue: string; tenantId: string; targetUserId: string; tapMethodId: string };

export function getAuthMethodDeletePath(userId: string, method: GraphAuthMethod): string | null {
  const methodType = method["@odata.type"]?.toLowerCase();
  if (methodType?.includes("passwordauthenticationmethod")) return null;
  if (methodType?.includes("emailauthenticationmethod")) return `/users/${userId}/authentication/emailMethods/${method.id}`;
  if (methodType?.includes("phoneauthenticationmethod")) return `/users/${userId}/authentication/phoneMethods/${method.id}`;
  if (methodType?.includes("microsoftauthenticatorauthenticationmethod")) return `/users/${userId}/authentication/microsoftAuthenticatorMethods/${method.id}`;
  if (methodType?.includes("fido2authenticationmethod")) return `/users/${userId}/authentication/fido2Methods/${method.id}`;
  if (methodType?.includes("softwareoathauthenticationmethod")) return `/users/${userId}/authentication/softwareOathMethods/${method.id}`;
  if (methodType?.includes("windowshelloforbusinessauthenticationmethod")) return `/users/${userId}/authentication/windowsHelloForBusinessMethods/${method.id}`;
  if (methodType?.includes("temporaryaccesspassauthenticationmethod")) return `/users/${userId}/authentication/temporaryAccessPassMethods/${method.id}`;
  return null;
}

export function toTapErrorMessage(err: unknown, stepId: SetupStep["id"]): string {
  const msg = err instanceof Error ? err.message : "Failed";
  const lower = msg.toLowerCase();
  if (lower.includes("403") && (stepId === "rotatePassword" || lower.includes("passwordprofile"))) {
    return (
      "Not authorized to reset the user password. " +
      "Ensure the UI app has delegated User-PasswordProfile.ReadWrite.All with tenant admin consent, then reconnect Azure. " +
      "Your signed-in account must have an active Entra role in the selected tenant that can reset the target user's password. " +
      "For all administrator accounts, use Privileged Authentication Administrator or Global Administrator."
    );
  }
  if (lower.includes("authenticationmethodspolicy") && lower.includes("403")) {
    return (
      "Not authorized to enable Temporary Access Pass for this tenant. " +
      "This requires the Authentication Policy Administrator role (a higher privilege than " +
      "creating a pass) — ask a tenant admin to enable it in Entra ID > Authentication methods " +
      "> Policies, or grant that role temporarily."
    );
  }
  if (lower.includes("403") && (lower.includes("temporaryaccesspassmethods") || lower.includes("accessdenied"))) {
    return (
      "Not authorized to create Temporary Access Pass. " +
      "Ensure your signed-in account has Authentication Administrator or Privileged Authentication Administrator role, " +
      "the app has delegated UserAuthenticationMethod.ReadWrite.All with admin consent, and Temporary Access Pass is enabled in Entra Authentication methods policy."
    );
  }
  if (lower.includes("aadsts65001") || lower.includes("interaction_required") || lower.includes("consent_required")) {
    return "Graph admin consent is required for this tenant. Reconnect Azure and grant consent, then try again.";
  }
  if (lower.includes("404") && lower.includes("temporaryaccesspassmethods")) {
    return "Selected user was not found in the current tenant context. Re-select the user and try again.";
  }
  if (lower.includes("authentication/methods") && lower.includes("403")) {
    return (
      "Not authorized to remove existing sign-in methods. " +
      "Ensure your account has Authentication Administrator or Privileged Authentication Administrator role, " +
      "and delegated UserAuthenticationMethod.ReadWrite.All has admin consent."
    );
  }
  return msg;
}
