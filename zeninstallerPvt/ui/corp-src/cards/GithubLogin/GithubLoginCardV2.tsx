/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import BaseCard from "../../components/BaseCard";
import type { CardChrome } from "../../types";
import { GithubLoginAction, GithubLoginContent } from "./GithubLoginCard";
import type { UseGithubLoginCardV2 } from "./useGithubLoginCardV2";

export default function GithubLoginCardV2({ cardChrome, auth }: { cardChrome: CardChrome; auth: UseGithubLoginCardV2 }) {
  const { baseCardContext, githubLoginContext } = auth;
  return (
    <BaseCard
      cardId={baseCardContext.cardId}
      title={baseCardContext.title}
      summary={baseCardContext.summary}
      lifecycle={baseCardContext.lifecycle}
      expanded={cardChrome.expanded}
      onToggle={cardChrome.onToggle}
      action={<GithubLoginAction login={githubLoginContext.account?.login} />}
    >
      <GithubLoginContent auth={githubLoginContext} />
    </BaseCard>
  );
}
