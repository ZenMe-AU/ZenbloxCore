/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import { Box, Typography } from "@mui/material";
import type { ReactElement } from "react";
import type { AppContext } from "../../appContext";
import BaseCard from "../../components/BaseCard";
import { PrivAvdDeployContent } from "../../components/PrivAvdDeployCard";
import { PRIVAVD_GALLERY_DESCRIPTION, PRIVAVD_GALLERY_RESOURCES } from "./config";
import type { UseAvdGalleryV2 } from "./useAvdGalleryV2";
import { useAvdGalleryV2 } from "./useAvdGalleryV2";

type Props = {
  appCtxStore: AppContext;
};

function Intro() {
  return (
    <Typography variant="body1" color="text.secondary" sx={{ lineHeight: 1.7 }}>
      {PRIVAVD_GALLERY_DESCRIPTION}
    </Typography>
  );
}

function CardContentMain({ privateContext }: UseAvdGalleryV2) {
  const { deployment, variables, selectedEnv, fetchLog } = privateContext;
  const target = variables.target;
  return (
    <PrivAvdDeployContent
      description={PRIVAVD_GALLERY_DESCRIPTION}
      resources={PRIVAVD_GALLERY_RESOURCES}
      privAvd={deployment}
      account={target?.account ?? null}
      repoName={target?.repository.name ?? ""}
      selectedEnv={selectedEnv}
      variables={variables}
      fetchLog={fetchLog}
      saveVariable={async (key, value, savedValue) => {
        const api = variables.api;
        if (!api || !target) throw new Error("Connect to GitHub and select an environment before saving variables");
        await (savedValue ? api.updateVariable : api.createVariable)(
          target.account,
          target.repository.name,
          key,
          value,
          target.environment.name,
        );
      }}
    />
  );
}

function CardEntrypoint({ appCtxStore }: Props): ReactElement {
  const { baseCardContext, privateContext } = useAvdGalleryV2(appCtxStore);
  return (
    <BaseCard baseCardContext={baseCardContext} appContext={privateContext.appContext} blockedIntro={<Intro />}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <CardContentMain baseCardContext={baseCardContext} privateContext={privateContext} />
      </Box>
    </BaseCard>
  );
}

export default CardEntrypoint;
