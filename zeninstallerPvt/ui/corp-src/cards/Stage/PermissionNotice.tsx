/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Button } from "@mui/material";
import { GRAPH_PERMISSIONS } from "../../config/azureConfig";
import Caption from "../../components/Caption";
import WarningNotice from "../../components/WarningNotice";

// Graph permission ids back to the names an admin recognises in Entra.
const GRAPH_PERMISSION_NAMES: Record<string, string> = Object.fromEntries(Object.entries(GRAPH_PERMISSIONS).map(([name, id]) => [id, name]));

type Props = {
  missing: readonly string[] | null;
  error: string | null;
  granting: boolean;
  onGrant: () => Promise<void>;
};

export default function PermissionNotice({ missing, error, granting, onGrant }: Props) {
  const message =
    error ??
    (missing
      ? "The pipeline's service principal is missing these Microsoft Graph permissions, so the deploy will fail until they are granted."
      : "Checking the pipeline's Microsoft Graph permissions...");
  return (
    <WarningNotice message={message}>
      {!!missing?.length && <Caption>{missing.map((id) => GRAPH_PERMISSION_NAMES[id] ?? id).join(", ")}</Caption>}
      {!!missing?.length && (
        <Button
          size="small"
          variant="outlined"
          onClick={() => void onGrant()}
          disabled={granting}
          aria-busy={granting}
          sx={{ alignSelf: "flex-start", minWidth: 0, px: 1 }}
        >
          {granting ? "Granting..." : "Grant permissions"}
        </Button>
      )}
    </WarningNotice>
  );
}
