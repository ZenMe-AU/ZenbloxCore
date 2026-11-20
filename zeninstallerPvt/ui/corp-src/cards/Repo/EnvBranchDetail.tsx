/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Button, CircularProgress, MenuItem, Select } from "@mui/material";
import FieldLabel from "../../components/FieldLabel";
import ErrorText from "../../components/ErrorText";
import AddIcon from "@mui/icons-material/Add";
import CallSplitIcon from "@mui/icons-material/CallSplit";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import type { Branch } from "../../types";

// ─── Props ────────────────────────────────────────────────────────────────────

type Props = {
  targetBranch: string; // The branch name to create — derived from the selected environment name.
  branches: Branch[];
  sourceBranch: string;
  onSourceBranchChange: (v: string) => void;
  creatingBranch: boolean;
  createBranchError: string | null;
  onCreateBranch: (target: string) => void;
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function EnvBranchDetail({
  targetBranch,
  branches,
  sourceBranch,
  onSourceBranchChange,
  creatingBranch,
  createBranchError,
  onCreateBranch,
}: Props) {
  return (
    <Box sx={{ p: 2.5, mt: 1.5, border: "1px solid", borderColor: "primary.light", borderRadius: 1, backgroundColor: "background.default" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        {/* Create button */}
        <Button
          onClick={() => onCreateBranch(targetBranch)}
          disabled={creatingBranch || !sourceBranch}
          variant="contained"
          size="small"
          startIcon={creatingBranch ? <CircularProgress aria-label={`Creating branch ${targetBranch}`} size={12} /> : <AddIcon />}
          aria-busy={creatingBranch}
        >
          Create New Branch: {targetBranch}
        </Button>

        <>
          <FieldLabel id="repo-source-branch-label" htmlFor="repo-source-branch" sx={{ flexShrink: 0 }}>
            Clone the new branch from existing branch:
          </FieldLabel>
          <Select id="repo-source-branch" size="small" aria-labelledby="repo-source-branch-label" value={sourceBranch} onChange={(e) => onSourceBranchChange(e.target.value)} sx={{ mr: 3, minWidth: 140 }}>
            {branches.map((branch) => (
              <MenuItem key={branch.name} value={branch.name}>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  <CallSplitIcon aria-hidden="true" sx={{ typography: "caption", color: "text.muted" }} />
                  {branch.name}
                  {branch.protected && (
                    <Box component="span" sx={{ color: "warning.main", ml: 0.5 }}>
                      protected
                    </Box>
                  )}
                </Box>
              </MenuItem>
            ))}
          </Select>
        </>
      </Box>

      {createBranchError && (
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 1,
            mt: 1.5,
            p: 1.25,
            borderRadius: "6px",
            backgroundColor: "background.default",
            border: "1px solid",
            borderColor: "error.light",
          }}
        >
          <ErrorOutlineIcon aria-hidden="true" sx={{ typography: "body2", color: "error.main" }} />
          <ErrorText>{createBranchError}</ErrorText>
        </Box>
      )}
    </Box>
  );
}
