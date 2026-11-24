# Card Prototype Design

This document describes the card architecture demonstrated by <CardName> and gives a migration guide for cards moving to the BaseCard model.

## Design Goals

- Each card owns its workflow state machine and domain behavior.
- BaseCard owns shared card presentation: expansion, status chrome, loading and blocked content, force-unlock display, and the optional state diagram.
- AppContext owns the card registry and the typed shared data cards publish for other cards to consume, including titles and lifecycle/status needed for prerequisite discovery and checks.
- `baseCardContext` is the public, serializable card state consumed by BaseCard and other cards.
- `privateContext` carries runtime-only dependencies such as dispatch and the current AppContext snapshot.
- Shared rules, especially prerequisite evaluation, have one implementation.

## Ownership

| Concern | Owner | Notes |
| --- | --- | --- |
| Card workflow lifecycle and transitions | Card state machine | Reducer validates card-specific events and transitions. |
| Card ID, title, prerequisite IDs, unmet prerequisite IDs, summary, completion data | `baseCardContext` | This is the card's public state. Do not mirror these fields in `privateContext`. |
| Card registry and inter-card shared data | AppContext | Each card publishes typed public data; other cards read the registry to discover prerequisites and inspect their published status/data. Keep private state and callbacks out of this channel. |
| AppContext subscription and publishing | Card hook | Subscribe with `useSyncExternalStore`; publish this card's title and status after render. |
| Dispatch and runtime services | `privateContext` | Keep callbacks, dispatch, and service snapshots out of serialized base-card data. |
| Prerequisite matching rule | `checkPrerequisites` in `components/useBaseCard.ts` | Call the shared function; do not reimplement matching in an individual card. |
| Loading, blocked, force-unlocked presentation | BaseCard | Cards may provide intro/content overrides when the shared defaults do not fit. |
| Force-unlock display override | BaseCard | This is local display state. It does not complete prerequisites or change the card's workflow state. |
| Card-specific panels and operations | Card components | These receive the public context plus required runtime dependencies. |

## Context and State

A card state machine typically keeps its workflow lifecycle at the top level and its public card data under `baseCardContext`:

```ts
export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & {
    unmetCardPrerequisites: string[];
  };
  privateContext: PrivateContext;
};
```

The `lifecycle` omission is intentional: the reducer stores the workflow lifecycle once, then `getBaseCardContext` projects it into the public context. Prerequisite IDs remain the shared `BaseCardContext` field; do not omit and redeclare them with a card-specific copy.

`privateContext` should contain only runtime dependencies. <CardName> currently uses an empty reducer-owned private context; its hook adds `appContext` and `dispatch` for component use. Do not put serializable card state in that runtime channel.

The shared `Lifecycle` union includes `forceUnlocked`. A card's graph should cover the states required by its workflow and any BaseCard display-state behavior it chooses to demonstrate. <CardName> includes `blocked -> forceUnlocked -> blocked` so its state diagram can describe the override. BaseCard owns the actual force-unlock UI state; it does not dispatch a force-unlock event into <CardName>'s reducer.

## BaseCard Contract

A migrated card entrypoint should pass the public context and runtime AppContext snapshot to BaseCard, then render the card's normal content as children:

```tsx
return (
  <BaseCard
    baseCardContext={card.baseCardContext}
    appContext={card.privateContext.appContext}
    blockedIntro={<Intro />}
    loadingContent={<CardLoading />}
    action={<CardAction />}
  >
    <CardContent baseCardContext={card.baseCardContext} privateContext={card.privateContext} />
  </BaseCard>
);
```

BaseCard selects content according to its display lifecycle:

- `loading`: render `loadingContent` or the default spinner.
- `blocked`: always render the card's `Intro` through the required `blockedIntro={<Intro />}` prop, followed by prerequisite links and BaseCard's force-unlock control; use `blockedContent` to replace the default prerequisite list when needed.
- `forceUnlocked`: render BaseCard's undo notice and the card children. The underlying prerequisite IDs remain unmet.
- Other lifecycle states: render the card children.

Pass the AppContext snapshot when BaseCard needs registered card titles for prerequisite links. It is a read-only snapshot, not the store or a dispatch channel.

## State Machine Pattern

Define the card's state, events, initial state, graph, transition guard, and reducer in `stateMachine.ts`.

- Keep events focused on card-owned workflow and data changes.
- Store prerequisite IDs and unmet IDs in `baseCardContext`.
- Make prerequisite edits return a new `baseCardContext` object and a new `prerequisiteIds` array.
- Use `canTransition` both in UI controls and in the reducer so disabled controls are not the only guard.
- Treat BaseCard's force-unlock display as separate from whether prerequisites are met; do not set `done` or publish `complete` because the user force-unlocked the card.
- Derive summary and completion fields from the reducer state in `getBaseCardContext` rather than maintaining duplicate values.

<CardName>'s core events illustrate the pattern:

- `card-prerequisite`: update a selected prerequisite and return to loading.
- `sync-card-prerequisites`: store the latest result from the shared prerequisite check and return to loading.
- `check-prerequisites`: when loading completes, choose ready or blocked from the current unmet-ID list.
- `transition`: apply a user-requested workflow transition only when allowed.

## Hook Pattern

The card hook connects the pure state machine to React and AppContext:

1. Subscribe to AppContext with `useSyncExternalStore`.
2. Initialize the reducer with the card's initial state.
3. Call the shared `checkPrerequisites(appContext, baseCardContext)` and dispatch a sync event only when its result changes.
4. If the workflow is loading, schedule the card's prerequisite-check event in an effect and cancel the timer on dependency changes or unmount.
5. Publish the card's title and workflow status to AppContext in an effect.
6. Return `{ baseCardContext, privateContext }` to the entrypoint.

Do not put the shared prerequisite matching algorithm in BaseCard's render path. Hooks and state-machine helpers need the result before rendering in order to gate operations and lifecycle transitions. BaseCard consumes that result to present blocked UI.

## Folder and File Names

Choose one canonical PascalCase `<CardName>` and use it consistently for the card folder, component filename, hook filename, and hook result type:

```text
cards/<CardName>/
  <CardName>.tsx
  use<CardName>.ts
```

Use `.tsx` for the hook file only if it contains JSX; otherwise use `.ts`. For example, <CardName> is organized as `cards/<CardName>/<CardName>.tsx` and `cards/<CardName>/Use<CardName>.ts`, and its hook result type is `Use<CardName>`. Do not use a different shortened or legacy name for the folder or paired files.

## Component Pattern

- Every card implementation file follows <CardName>'s explicit top-level component shape and order:
  1. `Intro` for card-specific introduction content; every card must pass `<Intro />` to BaseCard as `blockedIntro`, so the intro remains visible when blocked.
  2. `PrerequisitesPanel` when the card needs an editable prerequisite/lifecycle panel.
  3. `ResultsPanel` when the card needs a diagnostic/results panel.
  4. `CardContentMain` to compose the intro, any panels, and the card's action content.
  5. `CardEntrypoint` to call the card hook and wrap `CardContentMain` in BaseCard.
  6. A default export of `CardEntrypoint`.
- `PrerequisitesPanel` and `ResultsPanel` are optional. If implemented, both use the same destructured `UseCard` prop shape; neither creates another context contract or accepts pieces of the context as separate props.
- Keep `CardEntrypoint` small: call the card hook, render BaseCard, and pass normal content as children. Do not put reducer logic or whole panel implementations in the entrypoint.
- Pass `baseCardContext` to panels that display or mutate public card data.
- Pass `privateContext` only to components that need dispatch or runtime services.
- Keep card-specific UI in small components such as prerequisite panels, results, intro, and actions.
- Always provide `blockedIntro={<Intro />}`. Use BaseCard's `blockedContent` and `loadingContent` slots rather than copying shared blocked/loading controls into each card.
- State diagrams should reflect the card's state graph. A custom diagram layout is optional; the default StateDiagram layout can be used when no card-specific arrangement is needed.

Use the card hook's result type consistently for the optional panels and main content. In the example below, `UseCard` is a placeholder for that type; <CardName> names it `Use<CardName>`.

```tsx
function PrerequisitesPanel({ baseCardContext, privateContext }: UseCard) {
  // Optional component: prerequisite controls and lifecycle diagnostics.
}

function ResultsPanel({ baseCardContext, privateContext }: UseCard) {
  // Optional component: read-only state/context diagnostics.
}

function CardContentMain({ baseCardContext, privateContext }: UseCard) {
  return (
    <>
      <Intro />
      <PrerequisitesPanel baseCardContext={baseCardContext} privateContext={privateContext} />
      <ResultsPanel baseCardContext={baseCardContext} privateContext={privateContext} />
      {/* Card-specific action content */}
    </>
  );
}

const CardEntrypoint = (appCtx: AppContext): ReactElement => {
  const card = useCard(appCtx);
  return (
    <BaseCard baseCardContext={card.baseCardContext} appContext={card.privateContext.appContext}>
      <CardContentMain baseCardContext={card.baseCardContext} privateContext={card.privateContext} />
    </BaseCard>
  );
};

export default CardEntrypoint;
```

When a panel is omitted, omit its function and its invocation from `CardContentMain`; preserve the remaining structure and prop shape.

## Migration Checklist

1. Define the card's domain lifecycle union and state graph.
2. Define reducer state with one top-level workflow lifecycle and a `baseCardContext` containing the card ID, title, prerequisite IDs, and other shared public state.
3. Keep runtime dependencies and dispatch in `privateContext` only.
4. Implement a pure reducer, transition guard, summary projection, and card-specific events.
5. Subscribe to AppContext in the card hook and call the existing shared prerequisite checker.
6. Ensure unmet prerequisite IDs are stored once in `baseCardContext` and drive blocked/ready transitions.
7. Render the card through BaseCard, passing its AppContext snapshot and always providing `blockedIntro={<Intro />}`; add loading/content overrides only when needed.
8. Remove duplicate card-level blocked panels and force-unlock handlers; BaseCard owns those shared behaviors.
9. Add reducer/transition tests, BaseCard blocked/force-unlock tests, and UI tests for prerequisite selection, live AppContext updates, and normal content rendering.
10. Verify the card publishes its actual workflow lifecycle, not BaseCard's temporary force-unlocked display state.

## Validation

From `zeninstallerPvt/ui`, run the shared focused suites and type/lint checks:

```powershell
pnpm exec tsc -b
pnpm exec eslint corp-src/cards/<CardName> corp-src/components/BaseCard.tsx
pnpm exec vitest run corp-src/test/basecardlifecycle.test.ts
pnpm exec vitest run corp-src/test/<CardName>PrerequisiteSelect.test.tsx
```

<CardName> also has colocated tests and a local Vitest config. Run those with:

```powershell
pnpm exec vitest run --config corp-src/cards/<CardName>/vitest.config.ts
```

When migrating another card, add its tests to the normal discovered test suite where practical so CI runs them with the standard UI test command.
