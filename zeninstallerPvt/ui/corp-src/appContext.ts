/**
 * @license SPDX-FileCopyrightText: © 2026 Zenme Pty Ltd <info@zenme.com.au>
 * @license SPDX-License-Identifier: MIT
 */

import type { Lifecycle } from "./components/useBaseCard";
import type { Account, AzureAccount, CardId, CardStatus, GhEnv, RepoOption, User } from "./types";

export class SensitiveToken {
  readonly #value: string;

  constructor(value: string) { this.#value = value; }
  reveal(): string { return this.#value; }
  toJSON(): string { return "[REDACTED]"; }
  toString(): string { return "[REDACTED]"; }
}

// What MSAL looks an account up by; the id token and its claims stay with the sign-in card.
type AzureIdentity = Pick<AzureAccount, "homeAccountId" | "environment" | "tenantId" | "localAccountId" | "username">;

export type SharedCard = Readonly<{
  title: string;
  status: CardStatus | Lifecycle;
  githubAccount?: Readonly<User> | null;
  githubToken?: SensitiveToken | null;
  githubMode?: "direct" | "backend" | null;
  githubRepository?: Readonly<{ account: Readonly<Account>; repository: Readonly<RepoOption>; environment: Readonly<GhEnv> }> | null;
  azureAccount?: Readonly<AzureIdentity> | null;
  azureTenantId?: string | null; // The tenant ARM access was confirmed for.
}>;
type CardEntry = Readonly<{ initialised: false }> | (Readonly<{ initialised: true }> & SharedCard);
type SharedSnapshot = Readonly<{ cards: Readonly<Partial<Record<CardId, CardEntry>>> }>;
type CardEvent = Readonly<{ type: "added" | "initialised" | "updated"; cardId: CardId }>;

export function createAppContext() {
  let snapshot: SharedSnapshot = { cards: {} };
  const listeners = new Set<(event: CardEvent) => void>();

  function publish(event: CardEvent, entry: CardEntry) {
    snapshot = { cards: { ...snapshot.cards, [event.cardId]: entry } };
    listeners.forEach((listener) => listener(event));
  }

  return {
    getSnapshot: () => snapshot,
    subscribe: (listener: (event: CardEvent) => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    // Called after the card hook returns and React commits; initialised is not lifecycle ready.
    update: (cardId: CardId, shared: SharedCard) => {
      const current = snapshot.cards[cardId];
      const result = shared.githubRepository;
      const azure = shared.azureAccount;
      const entry: CardEntry = {
        initialised: true,
        title: shared.title,
        status: shared.status,
        ...("githubAccount" in shared ? { githubAccount: shared.githubAccount ? { login: shared.githubAccount.login } : null } : {}),
        ...("githubToken" in shared ? { githubToken: shared.githubToken ?? null } : {}),
        ...("githubMode" in shared ? { githubMode: shared.githubMode ?? null } : {}),
        ...("githubRepository" in shared ? {
          githubRepository: result ? {
            account: { id: result.account.id, login: result.account.login, type: result.account.type },
            repository: { id: result.repository.id, name: result.repository.name },
            environment: { id: result.environment.id, name: result.environment.name, url: result.environment.url },
          } : null,
        } : {}),
        ...("azureAccount" in shared ? {
          azureAccount: azure ? {
            homeAccountId: azure.homeAccountId, environment: azure.environment, tenantId: azure.tenantId,
            localAccountId: azure.localAccountId, username: azure.username,
          } : null,
        } : {}),
        ...("azureTenantId" in shared ? { azureTenantId: shared.azureTenantId ?? null } : {}),
      };
      if (!current) {
        publish({ type: "added", cardId }, { initialised: false });
        publish({ type: "initialised", cardId }, entry);
      } else if (!current.initialised) {
        publish({ type: "initialised", cardId }, entry);
      } else if (current.title !== shared.title || current.status !== shared.status
        || current.githubAccount?.login !== shared.githubAccount?.login || ("githubAccount" in current) !== ("githubAccount" in shared)
        || current.githubToken !== shared.githubToken || ("githubToken" in current) !== ("githubToken" in shared)
        || current.githubMode !== shared.githubMode || ("githubMode" in current) !== ("githubMode" in shared)
        || ("githubRepository" in current) !== ("githubRepository" in shared)
        || current.githubRepository?.account.id !== result?.account.id
        || current.githubRepository?.account.login !== result?.account.login
        || current.githubRepository?.account.type !== result?.account.type
        || current.githubRepository?.repository.id !== result?.repository.id
        || current.githubRepository?.repository.name !== result?.repository.name
        || current.githubRepository?.environment.id !== result?.environment.id
        || current.githubRepository?.environment.name !== result?.environment.name
        || current.githubRepository?.environment.url !== result?.environment.url
        || ("azureAccount" in current) !== ("azureAccount" in shared)
        || current.azureAccount?.homeAccountId !== azure?.homeAccountId
        || current.azureAccount?.environment !== azure?.environment
        || current.azureAccount?.tenantId !== azure?.tenantId
        || current.azureAccount?.localAccountId !== azure?.localAccountId
        || current.azureAccount?.username !== azure?.username
        || current.azureTenantId !== shared.azureTenantId || ("azureTenantId" in current) !== ("azureTenantId" in shared)) {
        publish({ type: "updated", cardId }, entry);
      }
    },
  };
}

export type AppContext = ReturnType<typeof createAppContext>;
