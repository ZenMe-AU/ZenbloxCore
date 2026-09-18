export const AZURE_VARIABLE_KEYS = ["AZURE_CLIENT_ID", "AZURE_PLAN_CLIENT_ID", "AZURE_SUBSCRIPTION_ID", "AZURE_TENANT_ID"] as const;
export const AWS_VARIABLE_KEYS = ["AWS_ROLE_ARN"] as const;
export const GITHUB_VARIABLE_KEYS = ["NAME", "DNS"] as const;
export const C01_KEYS = ["CONTACT_EMAILS"] as const;

export const AZURE_SECRET_KEYS = ["AZURE_CLIENT_SECRET"];
export const AWS_SECRET_KEYS = ["AWS_CLIENT_SECRET"];

const VARIABLE_DISPLAY_NAMES: Record<string, string> = {
  NAME: "COMPANY_SHORT_CODE",
  DNS: "DNS_DOMAIN",
};

/** Returns the UI label for a variable key, falling back to the key itself */
export function getVariableDisplayName(key: string): string {
  return VARIABLE_DISPLAY_NAMES[key] ?? key;
}
