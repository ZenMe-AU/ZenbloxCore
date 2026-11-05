/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button } from "@mui/material";
import StepRow from "../cards/StepRow";
import type { ResourceGroupCreationAccess as Access } from "../hooks/util/useResourceGroupCreationAccess";

export default function ResourceGroupCreationAccess({ access }: { access: Access }) {
  if (access.status === "idle") return null;
  return (
    <Box role="status" aria-live="polite">
      <StepRow
        step={{
          id: "subscription-access",
          label: access.status === "checking" ? "Checking subscription Contributor access..." : "Subscription access to create resource groups",
          status: access.status === "checking" ? "running" : access.status === "ready" ? "done" : "error",
          detail: access.error ?? undefined,
        }}
      />
      {access.status !== "checking" && (
        <Button size="small" onClick={access.retry}>
          Recheck subscription access
        </Button>
      )}
    </Box>
  );
}
