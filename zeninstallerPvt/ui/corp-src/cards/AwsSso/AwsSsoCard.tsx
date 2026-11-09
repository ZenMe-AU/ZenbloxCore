/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useState, type ReactNode } from "react";
import { Box, Button, Typography } from "@mui/material";
import Caption from "../../components/Caption";
import Card from "../../components/Card";
import ErrorText from "../../components/ErrorText";
import StatusText from "../../components/StatusText";
import WarningNotice from "../../components/WarningNotice";
import StepRow from "../StepRow";
import CloudVariableDetail from "../CloudVariableDetail";
import { AWS_SSO_ADMIN_GROUP, AWS_SSO_APP_NAME, isAwsAccountId } from "../../config/awsConfig";
import { AWS_SSO_KEYS } from "../../logic/variables";
import type { UseGithubVariables } from "../../hooks/useGithubVariables";
import type { Account, CardChrome, GhEnv } from "../../types";
import { AWS_SSO_STACK_TITLE } from "../AwsSsoStack/config";
import { AWS_SSO_SCOPES, AWS_SSO_TITLE } from "./config";
import type { UseAwsSsoCard } from "./useAwsSsoCard";

type Props = {
  card: CardChrome;
  awsSso: UseAwsSsoCard;
  githubAccount: Account | null;
  repoName: string;
  selectedEnv: GhEnv | null;
  variables: UseGithubVariables;
  githubUrl?: string;
};

// Same style as Stage's PermissionNotice button.
function SmallButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <Button size="small" variant="outlined" onClick={onClick} disabled={disabled} sx={{ alignSelf: "flex-start", minWidth: 0, px: 1 }}>
      {children}
    </Button>
  );
}

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary">
      Creates the {AWS_SSO_APP_NAME} enterprise app in Entra, so people in your organisation can sign in to the AWS console with their Microsoft account. It
      lets the {AWS_SSO_ADMIN_GROUP} group open the app and tells AWS which role each person gets. Assigning a group needs a Microsoft Entra ID P1 or P2
      licence.
    </Typography>
  );
}

export default function AwsSsoCard({ card, awsSso, githubAccount, repoName, selectedEnv, variables, githubUrl }: Props) {
  const { steps, running, run, reset, error, done, precheck, precheckError, grant, recheck } = awsSso;
  const accountId = variables.values.AWS_ACCOUNT_ID ?? "";
  const [granting, setGranting] = useState(false);
  const onGrant = async () => {
    setGranting(true);
    await grant().finally(() => setGranting(false));
  };

  return (
    <Card title={AWS_SSO_TITLE} lockedIntro={<Intro />} {...card}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <Intro />

        <CloudVariableDetail
          account={githubAccount}
          repo={repoName}
          envName={selectedEnv?.name ?? null}
          keys={AWS_SSO_KEYS}
          variables={variables}
          title="AWS account"
          githubUrl={githubUrl}
          keyErrors={{ AWS_ACCOUNT_ID: accountId && !isAwsAccountId(accountId) ? "An AWS account ID is 12 digits" : undefined }}
          keyHints={{ AWS_ACCOUNT_ID: <Typography color="text.muted">The 12 digits in the account menu at the top right of the AWS console.</Typography> }}
        />

        {!isAwsAccountId(accountId) ? (
          <WarningNotice message="Save your AWS account ID above first: the roles in the sign-in need it." />
        ) : precheckError ? (
          <WarningNotice message={precheckError}>
            <SmallButton onClick={recheck}>Check again</SmallButton>
          </WarningNotice>
        ) : precheck === "checking" ? (
          <WarningNotice message={`Checking your Microsoft Graph permissions and the ${AWS_SSO_ADMIN_GROUP} group...`} />
        ) : precheck === "needsConsent" ? (
          <WarningNotice message="ZenInstaller needs these Microsoft Graph permissions before it can set up AWS sign-in. An administrator has to grant them.">
            <Caption>{AWS_SSO_SCOPES.map((s) => s.split("/").pop()).join(", ")}</Caption>
            <SmallButton onClick={() => void onGrant()} disabled={granting}>
              {granting ? "Granting..." : "Grant permissions"}
            </SmallButton>
          </WarningNotice>
        ) : precheck === "needsGroup" ? (
          <WarningNotice message={`There is no ${AWS_SSO_ADMIN_GROUP} group in this tenant yet. Run the Organisation security groups stage first.`}>
            <SmallButton onClick={recheck}>Check again</SmallButton>
          </WarningNotice>
        ) : null}

        {steps.length === 0 && (
          <Button
            variant="contained"
            onClick={run}
            disabled={!isAwsAccountId(accountId) || precheck !== "ready" || !!precheckError}
            sx={{ alignSelf: "flex-start", py: 0.85, px: 2.5 }}
          >
            {done ? "Run AWS sign-in setup again" : "Set up AWS sign-in"}
          </Button>
        )}

        {steps.length > 0 && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.25, borderLeft: "2px solid", borderColor: "divider", pl: 1.5 }}>
            {steps.map((s) => (
              <StepRow key={s.id} step={s} />
            ))}
            {running && <StatusText>Running...</StatusText>}
            {!running && (
              <Button
                size="small"
                onClick={reset}
                sx={{
                  alignSelf: "flex-start",
                  mt: 0.5,
                  color: "text.muted",
                  "&:hover": { color: "primary.main" },
                }}
              >
                ↩ Start over
              </Button>
            )}
          </Box>
        )}

        {error && <ErrorText>{error}</ErrorText>}

        {done && (
          <Typography color="text.secondary">
            Next, create the {AWS_SSO_STACK_TITLE}. After that, members of {AWS_SSO_ADMIN_GROUP} open {AWS_SSO_APP_NAME} from My Apps to reach the AWS
            console.
          </Typography>
        )}
      </Box>
    </Card>
  );
}
