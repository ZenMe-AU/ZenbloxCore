/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { useEffect, useState } from "react";
import { Box, Button, LinearProgress, Link, Typography } from "@mui/material";
import { PIPELINE } from "./logic/pipeline";
import { type CardChrome, type CardHook, type CardId } from "./types";
import { groupSx } from "./config/cardLayout";
import { createResultStorage } from "./logic/resultStorage";
import { useGithubLoginCard } from "./cards/GithubLogin/useGithubLoginCard";
import { useGithubSignupCard } from "./cards/GithubSignup/useGithubSignupCard";
import { useRepoCard } from "./cards/Repo/useRepoCard";
import { useGithubVariables } from "./hooks/useGithubVariables";
import { useUrlRestore, useUrlSync } from "./hooks/useUrlStateManager";
import { useDeploymentPlan } from "./cards/Stage/useDeploymentPlan";
import { useCorpStageCards } from "./cards/Stage/useCorpStageCards";
import { useAzureLoginCard } from "./cards/AzureLogin/useAzureLoginCard";
import { useAzureAppRegistrationCard } from "./cards/AzureAppRegistration/useAzureAppRegistrationCard";
import { useAzureSubscriptionCard } from "./cards/AzureSubscription/useAzureSubscriptionCard";
import { useCreateDomainCard } from "./cards/CreateDomain/useCreateDomainCard";
import { useCoreInfraCard } from "./cards/CoreInfra/useCoreInfraCard";
import { usePrivateFrontendInfraCard } from "./cards/PrivateFrontendInfra/usePrivateFrontendInfraCard";
import { useRemoteTerminalInfraCard } from "./cards/RemoteTerminalInfra/useRemoteTerminalInfraCard";
import { useBackendDeployCard } from "./cards/BackendDeploy/useBackendDeployCard";
import { useAccessPassCard } from "./cards/AccessPass/useAccessPassCard";
import { useAwsLoginCard } from "./cards/AwsLogin/useAwsLoginCard";
import { useWebDeployCard } from "./cards/WebDeploy/useWebDeployCard";
import { useAwsSetupCard } from "./cards/AwsSetup/useAwsSetupCard";

import Header from "./components/Header";
import Footer from "./components/Footer";
import RestoreToast from "./components/RestoreToast";
import CardIntro from "./components/CardIntro";
import ExternalLink from "./components/ExternalLink";
import GithubLoginCard from "./cards/GithubLogin/GithubLoginCard";
import GithubSignupCard from "./cards/GithubSignup/GithubSignupCard";
import RepoCard from "./cards/Repo/RepoCard";
import AzureLoginCard from "./cards/AzureLogin/AzureLoginCard";
import AzureAppRegistrationCard from "./cards/AzureAppRegistration/AzureAppRegistrationCard";
import AzureSubscriptionCard from "./cards/AzureSubscription/AzureSubscriptionCard";
import CoreInfraCard from "./cards/CoreInfra/CoreInfraCard";
import PrivateFrontendInfraCard from "./cards/PrivateFrontendInfra/PrivateFrontendInfraCard";
import RemoteTerminalInfraCard from "./cards/RemoteTerminalInfra/RemoteTerminalInfraCard";
import BackendDeployCard from "./cards/BackendDeploy/BackendDeployCard";
import WebDeployCard from "./cards/WebDeploy/WebDeployCard";
import CreateDomainCard from "./cards/CreateDomain/CreateDomainCard";
import AccessPassCard from "./cards/AccessPass/AccessPassCard";
import AwsLoginCard from "./cards/AwsLogin/AwsLoginCard";
import AwsSetupCard from "./cards/AwsSetup/AwsSetupCard";
import StageCard from "./cards/Stage/StageCard";

import { withAITracking } from "@microsoft/applicationinsights-react-js";
import { reactPlugin } from "./monitor/applicationInsights";

// ─── App ──────────────────────────────────────────────────────────────────────

const EXPANDED_CARDS_KEY = "zeninstaller_corp_expanded_cards";
const { save: saveExpandedCards, load: loadExpandedCards } = createResultStorage<CardId[]>(EXPANDED_CARDS_KEY);

function AppDashboard() {
  const allCards: Record<string, CardHook> = {};

  function addCard<T extends CardHook>(newCard: T): T {
    allCards[newCard.cardId] = newCard;
    return newCard;
  }
  // ── Hooks ──────────────────────────────────────────────────────────────────
  const githubLogin = addCard(useGithubLoginCard());
  const githubSignup = addCard(useGithubSignupCard(githubLogin.done));

  const githubRepoEnv = addCard(
    useRepoCard({
      user: githubLogin.account,
    })
  );
  const githubVariables = useGithubVariables({
    account: githubRepoEnv.repo.selectedAccount,
    repoName: githubRepoEnv.repo.selectedRepo?.name ?? null,
    envName: githubRepoEnv.env.branchMatchError ? null : (githubRepoEnv.env.selectedEnv?.name ?? null),
  });
  const githubVariableValues = githubVariables.values;

  const corpName = githubVariableValues.NAME ?? "";
  const dnsName = githubVariableValues.DNS ?? "";

  // The Azure sign-in session, shared by the login / subscription / app-registration / access-pass cards.
  const azureLogin = addCard(
    useAzureLoginCard({
      savedTenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
    })
  );

  const awsLogin = addCard(useAwsLoginCard());

  const azureAccessPass = addCard(
    useAccessPassCard({
      azureAccount: azureLogin.account,
      confirmedTenantId: azureLogin.confirmedTenantId,
    })
  );

  const azureSubscription = addCard(
    useAzureSubscriptionCard({
      azureAccount: azureLogin.account,
      confirmedTenantId: azureLogin.confirmedTenantId,
      manualTenantId: azureLogin.manualTenantId,
      savedSubscriptionId: githubVariableValues.AZURE_SUBSCRIPTION_ID ?? "",
    })
  );

  const azureAppSetup = addCard(
    useAzureAppRegistrationCard({
      azureAccount: azureLogin.account,
      githubAccount: githubRepoEnv.repo.selectedAccount,
      githubRepo: githubRepoEnv.repo.selectedRepo?.name ?? "",
      githubRepoId: typeof githubRepoEnv.repo.selectedRepo?.id === "number" ? githubRepoEnv.repo.selectedRepo.id : null,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      subscriptionLabel: azureSubscription.subscriptionLabel,
      tenantId: azureLogin.confirmedTenantId || undefined,
      variableValues: githubVariableValues,
      manualTenantId: azureLogin.manualTenantId,
    })
  );

  const awsSetup = addCard(
    useAwsSetupCard({
      githubAccount: githubRepoEnv.repo.selectedAccount?.login ?? "",
      githubAccountId: githubRepoEnv.repo.selectedAccount?.id ?? 0,
      githubRepo: githubRepoEnv.repo.selectedRepo?.name ?? "",
      githubRepoId: typeof githubRepoEnv.repo.selectedRepo?.id === "number" ? githubRepoEnv.repo.selectedRepo.id : null,
      variableValues: githubVariableValues,
      awsReady: awsLogin.done,
      awsAccount: awsLogin.account,
    })
  );
  const infra = addCard(
    useCoreInfraCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      corpName,
      spClientId: githubVariableValues.AZURE_CLIENT_ID ?? "",
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
      variableValues: githubVariableValues,
    })
  );
  const remoteTerminalInfra = addCard(
    useRemoteTerminalInfraCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      variableValues: githubVariableValues,
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
      allowedOrigins: [window.location.origin, ...(dnsName ? [`https://www.${dnsName}`, `https://${dnsName}`] : [])],
      githubAccount: githubRepoEnv.repo.selectedAccount,
      githubRepo: githubRepoEnv.repo.selectedRepo?.name ?? "",
      githubRepoId: typeof githubRepoEnv.repo.selectedRepo?.id === "number" ? githubRepoEnv.repo.selectedRepo.id : null,
      githubEnvName: githubRepoEnv.env.selectedEnv?.name ?? null,
    })
  );
  const backendDeploy = addCard(
    useBackendDeployCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
      githubAccount: githubRepoEnv.repo.selectedAccount,
      repoName: githubRepoEnv.repo.selectedRepo?.name ?? "",
      selectedEnv: githubRepoEnv.env.selectedEnv,
      variableValues: githubVariableValues,
    })
  );
  const privateFrontendInfra = addCard(
    usePrivateFrontendInfraCard({
      variableValues: githubVariableValues,
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
      allowedOrigins: [window.location.origin],
    })
  );

  const webDeploy = addCard(
    useWebDeployCard({
      variableValues: githubVariableValues,
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
      githubAccount: githubRepoEnv.repo.selectedAccount,
      repoName: githubRepoEnv.repo.selectedRepo?.name ?? "",
      selectedEnv: githubRepoEnv.env.selectedEnv,
    })
  );
  const createDomain = addCard(
    useCreateDomainCard({
      azureAccount: azureLogin.account,
      subscriptionId: azureSubscription.selectedSubscriptionId,
      corpName,
      dnsName,
      spClientId: githubVariableValues.AZURE_CLIENT_ID ?? "",
      tenantId: githubVariableValues.AZURE_TENANT_ID ?? "",
    })
  );

  const plan = useDeploymentPlan({
    account: githubRepoEnv.repo.selectedAccount,
    repoName: githubRepoEnv.repo.selectedRepo?.name ?? null,
    pipeline: PIPELINE,
    selectedEnv: githubRepoEnv.env.selectedEnv,
    branches: githubRepoEnv.repo.branchList,
    branchMatchError: githubRepoEnv.env.branchMatchError,
    envReady: githubRepoEnv.done,
  });

  // ── URL restore + sync ───────────────────────────────────────────────────────
  const urlRestore = useUrlRestore([
    {
      active: githubLogin.status === "complete",
      fields: {
        account: githubRepoEnv.repo.restore.account,
        repo: githubRepoEnv.repo.restore.repo,
        env: githubRepoEnv.env.restore.env,
      },
    },
    {
      active: !!azureLogin.account,
      disabled: azureLogin.status === "unavailable",
      fields: {
        tenant: azureLogin.restore.tenant,
        subscription: azureSubscription.restore.subscription,
      },
    },
  ]);
  const selectedRepo = githubRepoEnv.repo.selectedRepo;
  useUrlSync(
    {
      account: githubRepoEnv.repo.selectedAccount?.login,
      repo: selectedRepo && !selectedRepo.isNew ? selectedRepo.name : undefined,
      env: githubRepoEnv.env.selectedEnv?.name,
      tenant: azureLogin.confirmedTenantId || undefined,
      subscription: azureSubscription.selectedSubscriptionId || undefined,
    },
    urlRestore.completed && !githubLogin.loggingIn
  );

  // ── Accordion + completion flags ───────────────────────────────────────────
  // A Set, not a single id, so multiple cards can stay expanded at once. Persisted so
  // reloading or navigating back restores what was open.
  const [expandedIds, setExpandedIds] = useState<Set<CardId>>(() => new Set(loadExpandedCards() ?? []));
  useEffect(() => {
    saveExpandedCards(Array.from(expandedIds));
  }, [expandedIds]);
  const toggle = (id: CardId) =>
    setExpandedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // Jumping to a prerequisite adds it to the expanded set rather than replacing it, so the card
  // you came from stays open too.
  const openCard = (id: CardId) => {
    setExpandedIds((cur) => new Set(cur).add(id));
    requestAnimationFrame(() => document.getElementById(`card-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const cardProps = (id: CardId): CardChrome => {
    const misconfigured = allCards[id].status === "unavailable";
    const requirementsForCard = (allCards[id].cardRequirements ?? [])
      .filter((reqCardId) => !allCards[reqCardId]?.done)
      .map((reqCardId) => ({
        label: allCards[reqCardId].cardDependencyLabel,
        target: reqCardId,
      }));
    const requirements = misconfigured ? [] : requirementsForCard;
    const locked = requirements.length > 0;
    return {
      cardId: id,
      // A locked card's hook computed its status assuming prerequisites were already met —
      // override to "idle" so it doesn't show e.g. a stale "warning" for work it can't do yet.
      status: locked ? "idle" : allCards[id].status,
      summary: allCards[id].summary,
      locked,
      requirements,
      unavailable: misconfigured,
      expanded: expandedIds.has(id),
      onToggle: () => toggle(id),
      onRequirementClick: openCard,
    };
  };

  const stageCards = useCorpStageCards({
    pipeline: PIPELINE,
    plan,
    allCards,
    repoDone: githubRepoEnv.done,
    repoDependencyLabel: githubRepoEnv.cardDependencyLabel,
    expandedIds,
    account: githubRepoEnv.repo.selectedAccount,
    repoName: githubRepoEnv.repo.selectedRepo?.name ?? "",
    selectedEnv: githubRepoEnv.env.selectedEnv,
    variableValues: githubVariableValues,
    onVariableConfirmed: githubVariables.onConfirmed,
    onToggle: toggle,
    onRequirementClick: openCard,
  });

  const progressCards = [
    ...([
      ["github_login", "GitHub login"],
      ["repo", "Repository & environment"],
      ["azure_login", "Azure login"],
      ["azure_subscription", "Choose Azure subscription"],
      ["azure_app_registration", "Create an app registration in Azure"],
      ["core_infra", "Terraform state backend"],
      ["create_domain", "Core domain"],
      ["remote_terminal_infra", "Private Zeninstaller Backend Environment"],
      ["backend_deploy", "Private Zeninstaller Backend"],
      ["private_frontend_infra", "Frontend hosting environment"],
      ["web_deploy", "Private Zeninstaller Frontend"],
      ["aws_login", "AWS login"],
      ["aws_setup", "AWS setup"],
    ] as const).map(([id, title]) => ({
      id,
      title,
      done: allCards[id].done,
      chrome: cardProps(id),
    })),
    ...stageCards.map(({ card, stageDef }) => ({
      id: card.cardId,
      title: stageDef.label,
      done: card.status === "complete" || card.status === "skipped",
      chrome: card,
    })),
    {
      id: "access_pass" as const,
      title: "Access pass",
      done: allCards.access_pass.done,
      chrome: cardProps("access_pass"),
    },
  ];
  const completedCount = progressCards.filter((item) => item.done).length;
  const nextStep = progressCards.find((item) => !item.done && !item.chrome.locked && !item.chrome.unavailable && item.chrome.status !== "loading");

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Box sx={{ minHeight: "100vh" }}>
        <Link className="visually-hidden skip-link" href="#main-content">
          Skip to main content
        </Link>
        <Header />

        <Box
          component="main"
          id="main-content"
          tabIndex={-1}
          sx={{ maxWidth: "var(--card-w-expanded)", mx: "auto", px: { xs: 2, sm: 4 }, py: { xs: 3, sm: 5 } }}
        >
          {/* Intro */}
          <Box
            id="installer-intro"
            sx={{
              bgcolor: "background.paper",
              borderRadius: (theme) => theme.palette.card.radius,
              border: "1px solid",
              borderColor: "divider",
              px: { xs: 2, sm: 3 },
              py: 2.5,
              boxShadow: (theme) => theme.palette.card.shadow,
            }}
          >
            <CardIntro variant="body1" sx={{ lineHeight: 1.7, mb: 1 }}>
              ZenInstaller helps you set up cloud resources for your organisation. Before you start, prepare:
            </CardIntro>
            <Box component="ol" sx={{ m: 0, pl: 3, color: "text.secondary" }}>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                A personal email address.
              </Typography>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                A GitHub account with permission to create a repository in the account or organisation that will own it.
              </Typography>
              <Typography component="li" variant="body2" sx={{ lineHeight: 1.7 }}>
                An organisation name and domain. You can register the domain with{" "}
                <ExternalLink href="https://www.godaddy.com/" label="GoDaddy">
                  GoDaddy
                </ExternalLink>
                {" "}or another provider.
              </Typography>
            </Box>
            <CardIntro variant="body1" sx={{ lineHeight: 1.7, mt: 1, mb: 0 }}>
              Complete the cards below in any order; each shows what it needs before it can run.
            </CardIntro>
          </Box>

          <Box sx={groupSx}>
            <Box component="section" aria-label="Deployment setup progress" sx={{ ...groupSx, mt: 3 }}>
              <Box sx={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "1fr", alignItems: "center", gap: 0.5, mb: 1 }}>
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                  <Typography component="h2" variant="sectionLabel">Deployment setup progress</Typography>
                  <Button
                    size="small"
                    variant="text"
                    disabled={!nextStep}
                    onClick={() => nextStep && openCard(nextStep.id)}
                    sx={{ flexShrink: 0 }}
                  >
                    {nextStep ? `Next step: ${nextStep.title}` : "All setup tasks complete"}
                  </Button>
                </Box>
                <LinearProgress
                  aria-label="Deployment setup progress"
                  variant="determinate"
                  value={(completedCount / progressCards.length) * 100}
                  sx={{ gridColumn: "1 / -1", height: 6, borderRadius: 3 }}
                />
              </Box>

              <GithubLoginCard card={cardProps("github_login")} auth={githubLogin} />

              <GithubSignupCard card={cardProps("github_signup")} signup={githubSignup} onOpenLogin={() => openCard("github_login")} />

              <RepoCard card={cardProps("repo")} githubRepo={githubRepoEnv} lockedByPR={false} />

              <AzureLoginCard card={cardProps("azure_login")} azureLogin={azureLogin} />

              <AzureSubscriptionCard
                card={cardProps("azure_subscription")}
                azure={azureLogin}
                subscription={azureSubscription}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
                onOpenAzureLogin={() => openCard("azure_login")}
                onUserInteract={() => urlRestore.cancel(["tenant", "subscription"])}
              />

              <AzureAppRegistrationCard
                card={cardProps("azure_app_registration")}
                appReg={azureAppSetup}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                subscriptionId={azureSubscription.selectedSubscriptionId}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
              />

              <CoreInfraCard
                card={cardProps("core_infra")}
                infra={infra}
                azureAccount={azureLogin.account}
                corpName={corpName}
                subscriptionId={azureSubscription.selectedSubscriptionId}
                spClientId={azureAppSetup.spClientId}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
              />

              <CreateDomainCard
                card={cardProps("create_domain")}
                createDomain={createDomain}
                azureAccount={azureLogin.account}
                corpName={corpName}
                dnsName={dnsName}
                subscriptionId={azureSubscription.selectedSubscriptionId}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
              />

              <RemoteTerminalInfraCard
                card={cardProps("remote_terminal_infra")}
                infra={remoteTerminalInfra}
                subscriptionId={azureSubscription.selectedSubscriptionId}
                tenantId={githubVariableValues.AZURE_TENANT_ID}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
              />

              <BackendDeployCard
                card={cardProps("backend_deploy")}
                backend={backendDeploy}
                repoFullName={
                  githubRepoEnv.repo.selectedAccount && githubRepoEnv.repo.selectedRepo
                    ? `${githubRepoEnv.repo.selectedAccount.login}/${githubRepoEnv.repo.selectedRepo.name}`
                    : null
                }
              />

              <PrivateFrontendInfraCard
                card={cardProps("private_frontend_infra")}
                infra={privateFrontendInfra}
                subscriptionId={azureSubscription.selectedSubscriptionId}
                tenantId={githubVariableValues.AZURE_TENANT_ID ?? ""}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
              />

              <WebDeployCard
                card={cardProps("web_deploy")}
                web={webDeploy}
                githubAccount={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
                githubUrl={githubRepoEnv.githubEnvUrl}
                repoFullName={
                  githubRepoEnv.repo.selectedAccount && githubRepoEnv.repo.selectedRepo
                    ? `${githubRepoEnv.repo.selectedAccount.login}/${githubRepoEnv.repo.selectedRepo.name}`
                    : null
                }
              />

              <AwsLoginCard card={cardProps("aws_login")} awsLogin={awsLogin} />

              <AwsSetupCard
                card={cardProps("aws_setup")}
                awsSetup={awsSetup}
                account={githubRepoEnv.repo.selectedAccount}
                repoName={githubRepoEnv.repo.selectedRepo?.name ?? ""}
                repoFullName={githubRepoEnv.repo.repoFullName}
                selectedEnv={githubRepoEnv.env.selectedEnv}
                variables={githubVariables}
              />

              {stageCards.map(({ key, ...stageCard }) => (
                <StageCard key={key} {...stageCard} azureAccount={azureLogin.account} />
              ))}

              <AccessPassCard card={cardProps("access_pass")} accessPass={azureAccessPass} />
            </Box>
          </Box>
        </Box >
        <Footer />
      </Box >

      <RestoreToast loading={urlRestore.restoring} warnings={urlRestore.warnings} onDismiss={urlRestore.dismissWarnings} />
    </>
  );
}

export default withAITracking(reactPlugin, AppDashboard, "corpInstaller");
