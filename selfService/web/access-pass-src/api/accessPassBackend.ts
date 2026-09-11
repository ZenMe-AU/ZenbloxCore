const url = import.meta.env.VITE_API_URL;
const functionKey = import.meta.env.VITE_ACCESS_PASS_FUNCTION_KEY as string | undefined;

export type BootstrapPassResetGroupsRequest = {
  tenantId: string;
  managerUserId: string;
  targetUserId: string;
};

export async function bootstrapPassResetGroups(request: BootstrapPassResetGroupsRequest): Promise<void> {
  const res = await fetch(`${url}/api/access-pass/bootstrap-groups`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(functionKey ? { "x-functions-key": functionKey } : {}),
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} /api/access-pass/bootstrap-groups: ${body}`);
  }
}
