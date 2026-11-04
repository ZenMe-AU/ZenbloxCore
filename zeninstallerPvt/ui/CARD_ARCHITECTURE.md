# Corp installer card architecture

How the cards in `corp-src/` are wired together. In short, each card is a self-contained folder, and cards talk to each other only through three channels that the platform owns.

## 1. Overview

```mermaid
flowchart TB
  Foundation["<b>Foundation cards</b><br/>GithubLogin · Repo · AzureLogin · AzureSubscription · AwsLogin"]

  subgraph Platform["Platform (not pluggable)"]
    direction LR
    S["<b>① Sessions</b> (session/)<br/>useGithubSession()<br/>useAzureSession()<br/>useAwsSession()<br/>useUrlRestoreStatus()"]
    V[("<b>② GitHub variables</b><br/>on the selected<br/>repo + environment")]
    CP["<b>③ CardsProvider</b><br/>faces → chrome<br/>locked · requirements<br/>expanded · progress"]
  end

  Feature["<b>Feature cards</b>: hot-pluggable folders<br/>AzureAppRegistration · CoreInfra · CreateDomain · RemoteTerminalInfra<br/>BackendDeploy · PrivateFrontendInfra · WebDeploy · AwsSetup<br/>Stage · AccessPass · GithubSignup"]

  Foundation -- "hooks run once by SessionProvider" --> S
  S -- "read" --> Feature
  Feature -- "save outputs / read inputs" <--> V
  Feature -- "report face" --> CP
  CP -- "cardProps(cardId)" --> Feature
  Foundation -. "report face / cardProps" .-> CP
```

| Channel | What it carries | Read with | Owned by |
|---|---|---|---|
| ① Sessions | Who is signed in, and which repo, environment, tenant and subscription are selected | `useGithubSession()`, `useAzureSession()`, `useAwsSession()`, `useUrlRestoreStatus()` | [session/SessionProvider.tsx](corp-src/session/SessionProvider.tsx) |
| ② GitHub variables | One card's saved output that is another card's input | `useGithubSession().variables` (`values`, `onConfirmed`) | [hooks/useGithubVariables.ts](corp-src/hooks/useGithubVariables.ts) |
| ③ Faces | Each card's `done`, `status`, `summary`, `cardRequirements` and title, which become every card's chrome | `useCards()` | [components/CardsProvider.tsx](corp-src/components/CardsProvider.tsx) |

No card imports another card folder, and no card takes props from App. ESLint enforces the first rule.

## 2. Provider nesting

```text
AppDashboard
└─ SessionProvider
   └─ GithubSessionProvider      useGithubLoginCard · useRepoCard · useGithubVariables
      └─ AzureSessionProvider    useAzureLoginCard · useAzureSubscriptionCard
         └─ AwsSessionProvider   useAwsLoginCard
            └─ UrlRestoreProvider useUrlRestore · useUrlSync
               └─ CardsProvider   faces · expanded card ids
                  └─ Dashboard    every cards/*/index.ts, by order
```

Each provider can read the ones above it. For example, the Azure session reads the saved `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` from the GitHub session's variables.

## 3. Channel ①: sessions

Foundation cards hold state that most other cards cannot do without (sign-ins, repo, environment, subscription). `SessionProvider` runs their hooks once for the whole page, and their card components only render what the session already holds.

| Session | Fields | Built from |
|---|---|---|
| GitHub | `login`, `repoEnv`, `variables`, `account`, `repoName`, `repoId`, `repoFullName`, `selectedEnv`, `githubUrl` | GithubLogin, Repo |
| Azure | `login`, `subscription`, `account`, `subscriptionId` | AzureLogin, AzureSubscription |
| AWS | `login` | AwsLogin |
| URL restore | `restoring`, `warnings`, `completed`, `cancel`, `dismissWarnings` | GitHub and Azure sessions |

Because `session/` imports these five folders, foundation cards cannot be unplugged. Every other card can.

## 4. Channel ②: GitHub variables

Variables live on the selected repo's GitHub environment, so they arrive with the GitHub session. A card saves its output through `CloudVariableDetail`, which calls `variables.onConfirmed(key, value)`, and any later card reads it from `variables.values`.

```mermaid
flowchart LR
  ASub[AzureSubscription] --> T(["AZURE_TENANT_ID<br/>AZURE_SUBSCRIPTION_ID"])
  AReg[AzureAppRegistration] --> CID(["AZURE_CLIENT_ID<br/>AZURE_PLAN_CLIENT_ID"])
  Core[CoreInfra] --> N(["NAME<br/>TF_STATE_RESOURCE_GROUP<br/>TF_STATE_STORAGE_ACCOUNT<br/>TF_STATE_CONTAINER"])
  Dom[CreateDomain] --> D(["DNS"])
  PFI[PrivateFrontendInfra] --> VCID(["VITE_AZURE_CLIENT_ID"])

  T --> R1["Azure session (saved tenant + subscription)<br/>CoreInfra · CreateDomain · RemoteTerminalInfra<br/>BackendDeploy · PrivateFrontendInfra · WebDeploy · Stage"]
  CID --> R2["CoreInfra · CreateDomain · Stage"]
  N --> R3["CoreInfra (done check) · CreateDomain"]
  D --> R4["RemoteTerminalInfra"]
  VCID --> R5["PrivateFrontendInfra (done check)"]
```

A variable is a contract between cards. Removing the card that writes it does not break the build. The reading card just shows the variable as missing until someone sets it by hand on GitHub.

## 5. Channel ③: faces

A card's hook returns a `CardHook` (its face). The card passes it to `<Card>`, which adds the id, title and requirements from the card's `index.ts`, reports it to `CardsProvider`, and gets its chrome back.

```mermaid
sequenceDiagram
  participant M as index.ts (via App)
  participant H as Card hook (e.g. useCoreInfraCard)
  participant C as Card (face, intro, action)
  participant P as CardsProvider
  participant D as Dashboard

  M->>C: CardModuleContext {id, title, cardRequirements}
  H->>C: face {done, status, summary, cardDependencyLabel}
  C->>P: report({...face, cardId: id, title, cardRequirements}), in useLayoutEffect
  P-->>C: cardProps(cardId) → {locked, requirements, expanded, status, onToggle, onRequirementClick}
  P-->>D: faces → progress bar and "Next step"
```

`cardProps(id)` is the only place where faces become chrome.

1. `requirements` are the card's `cardRequirements` whose face is not `done`. Each one is labelled with that face's `cardDependencyLabel`.
2. `locked` means at least one requirement is unmet. An `unavailable` (misconfigured) card shows no requirements.
3. A locked card's status is forced to `idle`, and its children are not rendered.
4. Progress and "Next step" list faces in the order they first reported, which is their order on the page. A face with `hideFromProgress` (GithubSignup) is left out.
5. `openCard(id)` adds the card to the expanded set and scrolls to `#card-<id>`.

Reports run in a layout effect, so a dependent card never flashes unlocked before the first paint. A report that changes nothing keeps the same state object, so nothing re-renders.

## 6. A card folder

```text
cards/CoreInfra/
├─ index.ts              the card's id, title, order and requirements; registers the id in CardId
├─ CoreInfraCard.tsx     reads sessions, calls its hook, renders <Card face intro action>
├─ useCoreInfraCard.ts   returns the face (status, done, requirements, …)
└─ useCoreInfraCard.test.ts
```

`index.ts` is the only place that names the card and wires it to other cards. It registers the id by declaration merging, so `types.ts` only collects ids:

```ts
declare module "../../types" {
  interface CardIdRegistry {
    core_infra: true;
  }
}

export default {
  id: "core_infra",
  title: "Terraform state backend",
  order: 70,
  cardRequirements: ["azure_login", "repo", "azure_subscription", "azure_app_registration"],
  Component: CoreInfraCard,
} satisfies CardModule;
```

App renders each module inside `CardModuleContext`, and `Card` reads its id, title and requirements from there. Neither the hook nor the component repeats them, so the same component could run under another id and title, wired to other cards. The hook only reports state, including `cardDependencyLabel`, which changes with state (e.g. "Sign in to Azure", then "Select a tenant"). The component declares only its intro and action, and its body holds only the card's content:

```tsx
<Card face={coreInfra} intro={<Intro />} action={<Action />}>
  …content…
</Card>
```

The Stage module renders several cards, so each `StageCard` passes its own `cardId` and `cardRequirements` (in the face) and `title`.

### Adding a card

1. Create `cards/<Name>/` with a hook that returns a `CardHook`.
2. Add a component that reads the sessions it needs and renders `<Card face>`.
3. Add `index.ts` that registers the id in `CardIdRegistry` and exports `{ id, title, order, cardRequirements, Component }`. App picks it up through `import.meta.glob`, so App needs no change.

### Removing a card

Delete its folder. Its id leaves `CardId`, so any other card that still lists it in `cardRequirements` becomes a TypeScript error rather than a silent lock. Cards that read its GitHub variables show them as missing.

### Card order

[config/cardOrder.ts](corp-src/config/cardOrder.ts) holds `CARD_ORDER`, a list of the ids from each `index.ts`. Cards on the list come first, in list order. Cards not on the list follow, sorted by their own `order`.

```ts
export const CARD_ORDER: readonly string[] = ["github_login", "repo", "azure_login", "stages", "access_pass"];
```

- An id with no card is ignored, so removing or parking a card folder never breaks the list.
- The Stage folder renders all pipeline-stage cards, which move together under the id `"stages"`. Stage registers that id for this list only; no card reports it, so never list it in `cardRequirements`.
- An empty list means every card uses its own `order`.
- The progress bar and "Next step" follow the page order, so they follow the list too.

### Turning a card off

Move its folder to `corp-src/cards-spare/`, and move it back to turn it on again. App only loads `cards/*/index.ts`, so a parked card is not rendered and its hook never runs, but it is still type-checked, linted and tested, so it can be moved back as it is.

A parked card's id stays in `CardId`, so TypeScript does not catch a live card that still requires it. Such a card stays locked, so park only cards that nothing else lists in `cardRequirements`.

Currently parked:

| Card | Why |
|---|---|
| GlobalGroups | The `c02globalGroups` stage covers the same flow |

### Rules

| Rule | Enforced by |
|---|---|
| A card folder never imports a sibling card folder | ESLint `no-restricted-imports` on `corp-src/cards*/*/**` |
| A card requires only ids that exist | TypeScript (`CardId = keyof CardIdRegistry`) |
| A module's `id` is a registered id | TypeScript (`CardModule.id: CardId`) |
| No two modules share an id | App throws at startup, naming both `index.ts` files |
| Every `Card` has an id | `Card` throws if it gets none from its module or `face.cardId` |
| A card's tests live in its folder | `vitest.config.ts` includes `*-src/**/*.test.*` |
| Contexts and hooks live in `.ts` files, providers and components in `.tsx` files | ESLint `react-refresh/only-export-components` |
| Foundation cards (GithubLogin, Repo, AzureLogin, AzureSubscription, AwsLogin) stay | `session/` imports them |
