# Card Prototype Design

This document describes the card architecture demonstrated by <CardName> and gives a migration guide for cards moving to the BaseCard model.

## Design Goals

- Each card owns its workflow state machine and domain behavior.
- BaseCard owns shared card presentation: expansion, status chrome, loading and blocked content, force-unlock display, and the optional state diagram.
- `AppContext` is the only cross-card contract. A card explicitly publishes the smallest typed projection that another card needs. It owns the card registry and the typed shared data cards publish for other cards to consume, including titles and lifecycle/status needed for prerequisite discovery and checks.
- `baseCardContext` is the public BaseCard state consumed by the entrypoint and card UI.
- `privateContext` is the card-local runtime model: services, callbacks, local workflow/UI state, and the current AppContext snapshot. It is not the cross-card publication contract.
- Shared rules, especially prerequisite evaluation, have one implementation.

## Ownership

### AppContext

- **Card registry and static card IDs:** `SharedCardDataById` is the source of truth for registered card IDs. Derive `AppContextCardId` from this registry; do not maintain a parallel ID union for new cards.
- **Cross-card data:** Cards publish only the smallest typed projection another card needs. Prerequisite consumers read the registry's titles, lifecycle/status, and shared data.
- **Private data:** Keep callbacks, dispatch, local workflow state, and card-only UI data out of AppContext.

### Card state machine

- **Workflow state:** Own card-specific events, transitions, and transition guards.
- **Public BaseCard projection:** Keep card ID, title, prerequisite IDs, unmet prerequisite IDs, summary, lifecycle, state-machine snapshot, and completion data under `baseCardContext`. Do not mirror them in `privateContext`.

### Card hook

- **Runtime wiring:** Subscribe to AppContext with `useSyncExternalStore`, evaluate prerequisites with the shared `checkPrerequisites` helper, and dispatch reducer events.
- **Publication:** Publish the card's title, lifecycle/status, and typed cross-card projection after render.
- **Return contract:** Return exactly `{ baseCardContext, privateContext }`.

### Card `privateContext`

- **Card-local model:** Own fetched collections, selections, loading/error flags, query projections, commands, callbacks, dispatch, and the current AppContext snapshot.
- **Publication boundary:** Private context is not shared automatically; only explicitly published AppContext data is available to other cards.

### BaseCard

- **Shared presentation:** Own expansion, status chrome, loading and blocked content, prerequisite links, the force-unlock display override, and the optional state diagram.
- **Override behavior:** Cards may provide intro or content slots. Force unlocking changes only BaseCard display state; it never completes prerequisites or the workflow.
- **Shared rule:** Prerequisite matching is implemented once in `checkPrerequisites`; cards do not reimplement it.

### Card components

- **Card-specific UI:** Own panels, forms, actions, and domain presentation using `baseCardContext` plus any required `privateContext`.

## Context and State

A card state machine typically keeps its workflow lifecycle at the top level and the standard BaseCard fields under `baseCardContext`:

```ts
export type State = BaseCardState<Lifecycle> & {
  baseCardContext: Omit<BaseCardContext<Lifecycle>, "lifecycle"> & {
    unmetCardPrerequisites: string[];
  };
  privateContext: PrivateContext;
};
```

The `lifecycle` omission is intentional: the reducer stores the workflow lifecycle once, then `getBaseCardContext` projects it into the public context. Prerequisite IDs remain the shared `BaseCardContext` field; do not omit and redeclare them with a card-specific copy.

`privateContext` is private by visibility, not by serialization. It may contain serializable card-internal UI/query data as well as callbacks and runtime services. Other cards must never depend on it. When another card needs a value, publish an intentional, typed projection through AppContext instead of moving that value into `baseCardContext`.

TanStack Query owns server-state caching, deduplication, cancellation, and refresh status. The hook projects the query result needed by its own UI into `privateContext`; it publishes only stable cross-card output to AppContext after the card's workflow confirms that output.

The shared `Lifecycle` union includes `forceUnlocked`. A card's graph should cover the states required by its workflow and any BaseCard display-state behavior it chooses to demonstrate. <CardName> includes `blocked -> forceUnlocked -> blocked` so its state diagram can describe the override. BaseCard owns the actual force-unlock UI state; it does not dispatch a force-unlock event into <CardName>'s reducer.

## BaseCard Contract

A migrated card entrypoint should pass the standard BaseCard context and runtime AppContext snapshot to BaseCard, then render the card's normal content as children:

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
- Store standard prerequisite IDs and unmet IDs in `baseCardContext`.
- Make prerequisite edits return a new `baseCardContext` object and a new `prerequisiteIds` array.
- Use `canTransition` both in UI controls and in the reducer so disabled controls are not the only guard.
- Treat BaseCard's force-unlock display as separate from whether prerequisites are met; do not set `done` or publish `complete` because the user force-unlocked the card.
- Derive BaseCard summary and completion fields from the reducer/query state in `getBaseCardContext` rather than maintaining duplicate values.
- Keep domain records, query loading/error state, form inputs, and card commands out of `baseCardContext`.

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
5. Publish the card's title, workflow status, and only the typed domain output required by other cards to AppContext in an effect.
6. Return `{ baseCardContext, privateContext }` to the entrypoint.

This is a two-key return contract, not a suggestion:

```ts
interface UseCard {
  baseCardContext: BaseCardContext<Lifecycle>;
  privateContext: {
    appContext: ReturnType<AppContext["getSnapshot"]>;
    // Card-specific runtime state, services, and callbacks.
  };
}

return { baseCardContext, privateContext };
```

Do not add card-specific fields beside `baseCardContext` or `privateContext`. A field used only by this card's component belongs in `privateContext`; a public serializable value belongs in `baseCardContext` (and, if needed by other cards, in the typed AppContext publication). This keeps component props uniform, makes ownership reviewable, and prevents legacy hook-shaped objects from entering migrated cards.

For every migrated hook, assert the exact top-level shape in a test:

```ts
expect(Object.keys(card)).toEqual(["baseCardContext", "privateContext"]);
```

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
- The card implementation module exposes only that default export. Keep `Intro`, panels, `CardContentMain`, and other implementation details private; do not add named exports for test access.
- `PrerequisitesPanel` and `ResultsPanel` are optional. If implemented, both use the same destructured `UseCard` prop shape; neither creates another context contract or accepts pieces of the context as separate props.
- Keep `CardEntrypoint` small: call the card hook, render BaseCard, and pass normal content as children. Do not put reducer logic or whole panel implementations in the entrypoint.
- Pass `baseCardContext` to panels that need the standard BaseCard lifecycle or metadata.
- Pass `privateContext` to card components that need internal query/UI state, commands, dispatch, or runtime services.
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
2. Define reducer state with one top-level workflow lifecycle and a `baseCardContext` containing only the standard BaseCard fields.
3. Keep card-internal state, query projections, runtime dependencies, commands, and dispatch in `privateContext`.
4. Implement a pure reducer, transition guard, summary projection, and card-specific events.
5. Return exactly `{ baseCardContext, privateContext }`; move legacy top-level fields into `privateContext` and add an exact-shape assertion.
6. Subscribe to AppContext in the card hook, call the existing shared prerequisite checker, and publish only explicitly shared typed outputs to AppContext.
7. Ensure unmet prerequisite IDs are stored once in `baseCardContext` and drive blocked/ready transitions.
8. Render the card through BaseCard, passing its AppContext snapshot and always providing `blockedIntro={<Intro />}`; add loading/content overrides only when needed.
9. Remove duplicate card-level blocked panels and force-unlock handlers; BaseCard owns those shared behaviors.
10. Add reducer/transition tests, BaseCard blocked/force-unlock tests, and UI tests for prerequisite selection, live AppContext updates, and normal content rendering.
11. Verify no other card reads `privateContext` or card-specific fields from `baseCardContext`; cross-card dependencies must use AppContext.
12. Verify the card publishes its actual workflow lifecycle, not BaseCard's temporary force-unlocked display state.

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
