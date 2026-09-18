import { app, HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";

const GRAPH = "https://graph.microsoft.com/v1.0";

type BootstrapGroupsRequest = {
  tenantId?: string;
  managerUserId?: string;
  targetUserId?: string;
};

function buildCorsHeaders(request: HttpRequest): Record<string, string> {
  const configuredOrigin = String(process.env.ACCESS_PASS_ALLOWED_ORIGIN || "*").trim() || "*";
  const requestOrigin = request.headers.get("origin");
  const allowOrigin =
    configuredOrigin === "*"
      ? "*"
      : requestOrigin && requestOrigin === configuredOrigin
        ? requestOrigin
        : configuredOrigin;

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,x-functions-key",
    "Access-Control-Max-Age": "86400",
  };
}

async function getGraphToken(tenantId: string): Promise<string> {
  const clientId = process.env.ACCESS_PASS_AAD_CLIENT_ID;
  const clientSecret = process.env.ACCESS_PASS_AAD_CLIENT_SECRET;
  const configuredTenant = process.env.ACCESS_PASS_AAD_TENANT_ID;
  const effectiveTenantId = configuredTenant || tenantId;

  if (!effectiveTenantId || !clientId || !clientSecret) {
    throw new Error(
      "Missing ACCESS_PASS_AAD_TENANT_ID, ACCESS_PASS_AAD_CLIENT_ID, or ACCESS_PASS_AAD_CLIENT_SECRET",
    );
  }

  const tokenRes = await fetch(`https://login.microsoftonline.com/${effectiveTenantId}/oauth2/v2.0/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials",
      scope: "https://graph.microsoft.com/.default",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text().catch(() => "");
    throw new Error(`Failed to acquire Graph token: ${tokenRes.status} ${body}`);
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string };
  if (!tokenData.access_token) {
    throw new Error("Graph token response missing access_token");
  }

  return tokenData.access_token;
}

async function graphRequest<T = unknown>(token: string, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${GRAPH}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${path}: ${body}`);
  }

  if (res.status === 204) {
    return null as T;
  }

  return (await res.json()) as T;
}

async function resolveGroupId(token: string, displayName: string): Promise<string> {
  const escaped = displayName.replace(/'/g, "''");
  const filter = encodeURIComponent(`displayName eq '${escaped}'`);
  const data = await graphRequest<{ value?: Array<{ id?: string; displayName?: string }> }>(
    token,
    `/groups?$filter=${filter}&$select=id,displayName&$top=1`,
  );

  const group = data?.value?.[0];
  if (!group?.id) {
    throw new Error(`Group '${displayName}' not found`);
  }

  return group.id;
}

async function resolveAdministrativeUnitId(token: string, displayName: string): Promise<string> {
  const escaped = displayName.replace(/'/g, "''");
  const filter = encodeURIComponent(`displayName eq '${escaped}'`);
  const res = await fetch(
    `https://graph.microsoft.com/beta/administrativeUnits?$filter=${filter}&$select=id,displayName&$top=1`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} /administrativeUnits: ${body}`);
  }

  const data = (await res.json()) as { value?: Array<{ id?: string; displayName?: string }> };
  const au = data?.value?.[0];
  if (!au?.id) {
    throw new Error(`Administrative Unit '${displayName}' not found`);
  }

  return au.id;
}

async function addMemberByRef(token: string, path: string, directoryObjectId: string): Promise<void> {
  const res = await fetch(`${GRAPH}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "@odata.id": `${GRAPH}/directoryObjects/${directoryObjectId}`,
    }),
  });

  if (res.ok || res.status === 204) {
    return;
  }

  const body = await res.text().catch(() => "");
  const lower = body.toLowerCase();
  const alreadyMember =
    (res.status === 400 || res.status === 409) &&
    (lower.includes("already exist") ||
      lower.includes("added object references already exist") ||
      lower.includes("object references already exist"));

  if (alreadyMember) {
    return;
  }

  throw new Error(`${res.status} ${path}: ${body}`);
}

async function addUserToGroup(token: string, groupId: string, userId: string): Promise<void> {
  await addMemberByRef(token, `/groups/${groupId}/members/$ref`, userId);
}

async function addUserToAdministrativeUnit(token: string, auId: string, userId: string): Promise<void> {
  const res = await fetch(`https://graph.microsoft.com/beta/administrativeUnits/${auId}/members/$ref`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      "@odata.id": `https://graph.microsoft.com/v1.0/directoryObjects/${userId}`,
    }),
  });

  if (res.ok || res.status === 204) {
    return;
  }

  const body = await res.text().catch(() => "");
  const lower = body.toLowerCase();
  const alreadyMember =
    (res.status === 400 || res.status === 409) &&
    (lower.includes("already exist") ||
      lower.includes("added object references already exist") ||
      lower.includes("object references already exist"));

  if (alreadyMember) {
    return;
  }

  throw new Error(`${res.status} /administrativeUnits/${auId}/members: ${body}`);
}

app.http("accessPassBootstrapGroups", {
  methods: ["POST", "OPTIONS"],
  authLevel: "function",
  route: "access-pass/bootstrap-groups",
  handler: async (request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> => {
    const corsHeaders = buildCorsHeaders(request);
    if (request.method.toUpperCase() === "OPTIONS") {
      return {
        status: 204,
        headers: corsHeaders,
      };
    }

    try {
      const body = (await request.json()) as BootstrapGroupsRequest;
      const tenantId = String(body.tenantId || "").trim();
      const managerUserId = String(body.managerUserId || "").trim();
      const targetUserId = String(body.targetUserId || "").trim();

      if (!tenantId || !managerUserId || !targetUserId) {
        return {
          status: 400,
          headers: corsHeaders,
          jsonBody: { error: "tenantId, managerUserId, and targetUserId are required" },
        };
      }

      const token = await getGraphToken(tenantId);
      const resetManagersGroupName = String(
        process.env.ACCESS_PASS_RESET_MANAGERS_GROUP_NAME || "Pass Reset Managers",
      ).trim();
      const resetTargetUsersAuName = String(
        process.env.ACCESS_PASS_RESET_TARGET_USERS_AU_NAME || "Pass Reset Targets",
      ).trim();

      const resetManagersGroupId = await resolveGroupId(token, resetManagersGroupName);
      const resetTargetUsersAuId = await resolveAdministrativeUnitId(token, resetTargetUsersAuName);

      await addUserToGroup(token, resetManagersGroupId, managerUserId);
      await addUserToAdministrativeUnit(token, resetTargetUsersAuId, targetUserId);

      return {
        status: 200,
        headers: corsHeaders,
        jsonBody: {
          success: true,
          groups: {
            managers: resetManagersGroupId,
          },
          administrativeUnits: {
            targets: resetTargetUsersAuId,
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown backend error";
      context.error(`access-pass bootstrap failed: ${message}`);
      return {
        status: 500,
        headers: corsHeaders,
        jsonBody: { error: message },
      };
    }
  },
});
