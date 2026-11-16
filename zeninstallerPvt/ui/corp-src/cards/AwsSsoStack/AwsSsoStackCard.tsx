/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState } from "react";
import { Box, Button, IconButton, Tooltip, Typography } from "@mui/material";
import CheckIcon from "@mui/icons-material/Check";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import ViewLink from "../../components/ViewLink";
import WarningNotice from "../../components/WarningNotice";
import CloudVariableDetail from "../CloudVariableDetail";
import { AWS_SSO_APP_NAME } from "../../config/awsConfig";
import { AWS_VARIABLE_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";
import { AWS_SSO_TITLE } from "../AwsSso/config";
import { AWS_SSO_STACK_TITLE, CREATE_STACK_URL, GITHUB_ROLE_NAME, GITHUB_ROLE_OUTPUT, samlStackName } from "./config";
import type { UseAwsSsoStackCard } from "./useAwsSsoStackCard";

type Props = {
  card: CardChrome;
  stack: UseAwsSsoStackCard;
  tenantId: string | null;
  repoExists: boolean;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      The AWS side of sign-in: a SAML provider that trusts your Entra tenant's sign-ins and the admin and read-only roles people get in the console. It also
      gives this repo's GitHub Actions read-only AWS access through the shared {GITHUB_ROLE_NAME} role, created if missing. Create it in CloudFormation from
      this template, which already has your tenant, certificate and repo in it.
    </Typography>
  );
}

// Reads the Entra app's signing certificate again and rebuilds the template; shown while there is no template to put it on.
function RegenerateButton({ onClick, checking }: { onClick: () => void; checking: boolean }) {
  return (
    <Button size="small" variant="outlined" onClick={onClick} disabled={checking} sx={{ alignSelf: "flex-start", minWidth: 0, px: 1 }}>
      {checking ? "Regenerating..." : "Regenerate"}
    </Button>
  );
}

export default function AwsSsoStackCard({ card, stack, tenantId, repoExists, githubAccount, repoName, selectedEnv, variables, githubUrl }: Props) {
  const { template, noCertificate, checking, check, outputError, error } = stack;
  const [copied, setCopied] = useState(false);
  const stackName = tenantId ? samlStackName(tenantId) : "";

  const copy = async () => {
    if (!template) return;
    await navigator.clipboard.writeText(template);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card title={AWS_SSO_STACK_TITLE} action={<ViewLink href={CREATE_STACK_URL} label="Open CloudFormation" />} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        {!repoExists && <WarningNotice message={`Create ${repoName || "the repository"} on GitHub first: the template trusts its GitHub Actions by the repo's id.`} />}
        {repoExists && !template && !noCertificate && !error && <Typography color="text.muted">Reading the Entra app...</Typography>}
        {noCertificate && (
          <WarningNotice
            message={`The ${AWS_SSO_APP_NAME} app has no signing certificate yet, so there is no template to show. Run ${AWS_SSO_TITLE} first, then regenerate.`}
          >
            <RegenerateButton onClick={check} checking={checking} />
          </WarningNotice>
        )}

        {template && (
          <>
            <Box sx={{ position: "relative", bgcolor: "action.hover", border: 1, borderColor: "divider", borderRadius: 1 }}>
              <Box sx={{ position: "absolute", top: 4, right: 4, display: "flex", gap: 0.5, bgcolor: "background.paper", borderRadius: 1 }}>
                <Tooltip title={checking ? "Regenerating..." : "Regenerate"}>
                  {/* A disabled button fires no events, so the span keeps the tooltip working. */}
                  <span>
                    <IconButton size="small" onClick={check} disabled={checking} aria-label="Regenerate the template">
                      <RefreshIcon fontSize="small" />
                    </IconButton>
                  </span>
                </Tooltip>
                <Tooltip title={copied ? "Copied" : "Copy"}>
                  <IconButton size="small" onClick={() => void copy()} aria-label="Copy the template">
                    {copied ? <CheckIcon fontSize="small" color="success" /> : <ContentCopyIcon fontSize="small" />}
                  </IconButton>
                </Tooltip>
                <Tooltip title="Download">
                  <IconButton
                    size="small"
                    component="a"
                    href={`data:application/x-yaml;charset=utf-8,${encodeURIComponent(template)}`}
                    download={`${stackName}.yaml`}
                    aria-label="Download the template"
                  >
                    <FileDownloadOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              </Box>
              <Box component="pre" data-sensitive="true" sx={{ m: 0, p: 2, pr: 10, maxHeight: 360, overflow: "auto", typography: "technical", lineHeight: 1.6 }}>
                <code>{template}</code>
              </Box>
            </Box>
            <Box component="ol" sx={{ m: 0, pl: 2.5, color: "text.secondary" }}>
              <li>Download the template.</li>
              <li>
                In CloudFormation, click <b>Create stack → With new resources</b>, upload the template and name the stack <code>{stackName}</code>. If the
                stack already exists, select it and choose <b>Update → Replace existing template</b> instead.
              </li>
              <li>Tick the box that acknowledges CloudFormation might create IAM resources, then submit.</li>
              <li>
                When the stack shows CREATE_COMPLETE or UPDATE_COMPLETE, open its <b>Outputs</b> tab, copy the <code>{GITHUB_ROLE_OUTPUT}</code> value and save it
                below as {AWS_VARIABLE_KEYS[0]}.
              </li>
            </Box>
            <Typography color="text.muted">
              When Entra renews the {AWS_SSO_APP_NAME} signing certificate, click Regenerate and update the stack with the new template, choosing Replace
              existing template.
            </Typography>
          </>
        )}

        {template && (
          <CloudVariableDetail
            account={githubAccount}
            repo={repoName}
            envName={selectedEnv?.name ?? null}
            keys={AWS_VARIABLE_KEYS}
            variables={variables}
            title="AWS console sign-in stack output"
            githubUrl={githubUrl}
            keyErrors={{ AWS_ROLE_ARN: outputError ?? undefined }}
            keyHints={{
              AWS_ROLE_ARN: <Typography color="text.muted">The {GITHUB_ROLE_OUTPUT} value from the stack's Outputs tab. GitHub Actions use it to read AWS.</Typography>,
            }}
          />
        )}

        {error && <ErrorText>{error}</ErrorText>}
        {error && !template && <RegenerateButton onClick={check} checking={checking} />}
      </Box>
    </Card>
  );
}
