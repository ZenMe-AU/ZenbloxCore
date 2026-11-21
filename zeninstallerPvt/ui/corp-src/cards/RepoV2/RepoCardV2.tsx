/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Link, Typography } from "@mui/material";
import BaseCard from "../../components/BaseCard";
import ViewLink from "../../components/ViewLink";
import RepoDetail, { Intro as RepoDetailIntro } from "./RepoDetail";
import EnvDetail from "./EnvDetail";
import { getRepoUrl } from "../../logic/github";
import { TEMPLATE_REPO, VALID_ENVS } from "../../config/githubConfig";
import type { CardChrome } from "../../types";
import type { UseRepoCardV2 } from "./useRepoCardV2";

type Props = {
  cardChrome: CardChrome;
  githubRepo: UseRepoCardV2;
};

function Intro() {
  return <RepoDetailIntro />;
}

/*
 * The repo card actually spans two concerns — which repo, and which environment in
 * it — so unlike the other cards its content is two Detail components, not one.
 */
function Action({ repoFullName }: { repoFullName: string | null }) {
  if (!repoFullName) return null;
  return <ViewLink href={getRepoUrl(repoFullName)} label="Open GitHub repository" />;
}

export default function RepoCardV2({ cardChrome, githubRepo }: Props) {
  const { repo, env } = githubRepo;
  const lifecycle = githubRepo.baseCardContext.lifecycle;
  return (
    <BaseCard baseCardContext={githubRepo.baseCardContext} expanded={cardChrome.expanded} onToggle={cardChrome.onToggle}
      action={<Action repoFullName={repo.repoFullName} />}>
      {lifecycle === "blocked" || lifecycle === "loading" ? (
        <>
          <Intro />
          {lifecycle === "blocked" && (
            <Typography role="status" sx={{ mt: 2 }}>
              <Link component="button" type="button" onClick={() => cardChrome.onRequirementClick("github_login_v2")}>
                Sign in to GitHub login 2
              </Link>
            </Typography>
          )}
        </>
      ) : (
      <>
      <RepoDetail
        accounts={repo.accountList}
        selectedAccount={repo.selectedAccount}
        onAccountChange={repo.setSelectedAccount}
        repos={repo.repoList}
        selectedRepo={repo.selectedRepo}
        onRepoChange={repo.setSelectedRepo}
        templateStatus={repo.templateStatus}
        templateName={repo.templateName}
        defaultTemplateRepo={TEMPLATE_REPO}
        isPrivate={repo.isPrivate}
        onIsPrivateChange={repo.setIsPrivate}
        includeAllBranch={repo.includeAllBranch}
        onIncludeAllBranchChange={repo.setIncludeAllBranch}
        cloning={repo.cloning}
        cloneError={repo.cloneError}
        cloneValidationWarning={repo.cloneValidationWarning}
        onClone={repo.onClone}
        createEnvs={repo.createEnvs}
        onCreateEnvsChange={repo.setCreateEnvs}
        cloneEnvWarning={repo.cloneEnvWarning}
        repoLoading={repo.repoLoading}
        repoRefreshFailed={repo.repoRefreshFailed}
        repoError={repo.repoError}
        onRefresh={repo.onRefresh}
      />
      {repo.status === "complete" && repo.templateStatus === "ready" && (
        <Box sx={{ mt: 2.5, pt: 2.5, borderTop: "1px solid", borderColor: "divider" }}>
          <EnvDetail
            envList={env.envList}
            validEnvs={VALID_ENVS}
            selectedEnv={env.selectedEnv}
            onEnvChange={env.setSelectedEnv}
            lockedByPR={false}
            branchMatchWarning={env.branchMatchWarning}
            branchMatchError={env.branchMatchError}
            loading={env.envLoading}
            refreshFailed={env.envRefreshFailed}
            onRefresh={env.onRefresh}
            repoFullName={repo.repoFullName}
            branches={repo.branchList}
            sourceBranch={repo.sourceBranch}
            onSourceBranchChange={repo.setSourceBranch}
            creatingBranch={repo.creatingBranch}
            createBranchError={repo.createBranchError}
            onCreateBranch={repo.onCreateBranch}
          />
        </Box>
      )}
      </>
      )}
    </BaseCard>
  );
}
