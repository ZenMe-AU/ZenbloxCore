import type { PipelineConfig } from "../../access-pass-src/types";
import { GRAPH_PERMISSIONS } from "../../access-pass-src/config/azureConfig";
import { AZURE_VARIABLE_KEYS, AWS_VARIABLE_KEYS, C01_KEYS } from "./variables";

export const PIPELINES: Record<string, PipelineConfig> = {
  corpSetup: {
    workflowId: "planChanges.yml",
    label: "ZenInstaller Setup Central Corp Environment",
    templateRepo: "ZenMe-AU/ZBCorpArchitecture",
    validEnvs: ["PROD", "TEST"] as const,
    stages: [
      {
        key: "c01",
        label: "c01subscription",
        azurePermissions: [],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          {
            type: "stageVar",
            keys: C01_KEYS,
            label: "c01 variables",
            descriptions: {
              CONTACT_EMAILS: "Multiple emails — separate with a comma, e.g. alice@example.com,bob@example.com",
            },
          },
        ],
      },
      {
        key: "c02",
        label: "c02globalGroups",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
          // TODO: confirm if PIM-managed group membership is needed (azuread_role_eligibility_schedule in c02 is commented out)
          // GRAPH_PERMISSIONS.PrivilegedAccessReadWriteAzureADGroup,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c05",
        label: "c05rootrg",
        azurePermissions: [],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c07",
        label: "c07userAccounts",
        azurePermissions: [
          GRAPH_PERMISSIONS.GroupReadWriteAll,
          GRAPH_PERMISSIONS.GroupMemberReadWriteAll,
          GRAPH_PERMISSIONS.UserReadWriteAll,
          GRAPH_PERMISSIONS.RoleManagementReadWriteDirectory,
          GRAPH_PERMISSIONS.UserAuthenticationMethodReadWriteAll,
          GRAPH_PERMISSIONS.PolicyReadWriteAuthenticationMethod,
          GRAPH_PERMISSIONS.DomainReadWriteAll,
        ],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c20",
        label: "c20awsentrasso",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
        ],
      },
      {
        key: "c21",
        label: "c21awsentrassoP2",
        azurePermissions: [GRAPH_PERMISSIONS.AppRoleAssignmentReadWriteAll, GRAPH_PERMISSIONS.PolicyReadWriteApplicationConfiguration],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
      {
        key: "c25",
        label: "c25cloudfront",
        azurePermissions: [GRAPH_PERMISSIONS.ApplicationReadWriteAll],
        prerequisites: [
          { type: "var", key: "NAME" },
          { type: "var", key: "DNS" },
          { type: "varGroup", keys: AZURE_VARIABLE_KEYS, label: "Azure variables configured" },
          { type: "varGroup", keys: AWS_VARIABLE_KEYS, label: "AWS variables configured" },
        ],
      },
    ],
  },
  // Add future pipelines here — no other files need to change
};

export function matchPipelineByTemplate(templateName: string): string | null {
  const entry = Object.entries(PIPELINES).find(([, cfg]) => cfg.templateRepo === templateName);
  return entry ? entry[0] : null;
}
