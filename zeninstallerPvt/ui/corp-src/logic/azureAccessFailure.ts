export type AzureAccessFailureKind = "permission" | "authentication" | "request";

export class MissingAzureAccessError extends Error {}

export function getAzureAccessFailureKind(error: unknown): AzureAccessFailureKind {
  const visited = new Set<unknown>();
  let current = error;
  while (current && !visited.has(current)) {
    visited.add(current);
    if (current instanceof MissingAzureAccessError) return "permission";
    if (typeof current !== "object") break;
    const status = "status" in current ? current.status : undefined;
    const message = current instanceof Error ? current.message : "";
    const httpStatus = status ?? message.match(/^(401|403)\s+\//)?.[1];
    if (Number(httpStatus) === 401) return "authentication";
    if (Number(httpStatus) === 403) return "permission";
    const code = "errorCode" in current ? current.errorCode : undefined;
    if (typeof code === "string" && /^(interaction_required|login_required|consent_required|no_account_error)$/.test(code)) {
      return "authentication";
    }
    current = "cause" in current ? current.cause : undefined;
  }
  return "request";
}