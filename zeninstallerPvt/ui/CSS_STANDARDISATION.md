# CSS in the corp installer: overview and standardisation plan

Scope: `zeninstallerPvt/ui` only. Paths below are relative to that folder (the old `web/` prefix no longer exists).

Sections 0–6 record the initial audit baseline from 2026-10-07; their counts and source-tree observations are historical, not a current inventory. Progress notes in section 7 supersede baseline findings where work has since been completed. Latest update: 2026-10-24.

## 0. Audit summary (2026-10-07)

Verified against the source tree as it stood on 2026-10-07, not against earlier notes.

- **At the time of this audit, the migration described in earlier revisions of this file was not in the tree.** `corp-src/App.css` was the unused Vite starter template (`.counter`, `.hero`, `#next-steps`; no import anywhere), `corp.tsx` imported only `index.css`, and `Card.tsx`, `ViewLink.tsx` and `AzureLoginCard.tsx` were fully inline-styled MUI. Subsequent progress is recorded in section 7.
- **Styling is ~100% inline MUI `sx`.** 764 `sx` blocks, 753 hard-coded hex colours, 298 `"N.NNrem"` font sizes and 153 `...mono` spreads across 36 card/component files. There is no theme, no CSS variables and no shared classes.
- **Typography is inconsistent and mostly small.** About 240 explicit sizes are below 0.8rem (11-12.8px); the IBM Plex families are referenced 67 times but never loaded.
- **Accessibility was the largest gap.** The initial audit found no page landmarks, no card headings, a mouse-only card header, status by colour/icon only, low-contrast text, and 36 `aria-*`/`label` hits for 24 form controls. Step 4's card-shell interaction and status-name work is now recorded below; page landmarks, broader contrast, and form-label work remain open.
- **Dead code.** `App.css`, `components/NavBar.tsx` and `components/SessionOverlay.tsx` have no importers.
- **Test coupling.** Playwright specs locate by role and accessible name, by `data-id`/`data-sensitive`, and by DOM shape (`.locator("..")`, `.locator("../..")`, `p:not([data-sensitive])`). Restyling must not change tag/nesting or accessible names without updating those specs.

Priorities, in order: (1) accessibility fixes, (2) one theme as the single source of truth, (3) delete the inline duplication card by card. The step-by-step plan is section 7.

## 1. How styling was structured at the initial audit

### Stylesheets

| File | Status | Purpose |
|---|---|---|
| `corp-src/index.css` | Active (imported by `corp.tsx`) | Global reset: `html/body/#root` height, `body` margin, system font stack, background `#f4f6f8`, text `#1a1a1a`. |
| `corp-src/App.css` | **Dead** (no importer; Vite starter template) | None. Delete or repurpose as the shared stylesheet. |
| `docs/.vitepress/` | Separate | Documentation site theme. Unrelated to the installer UI. |

There is no Tailwind, SCSS, CSS Modules, PostCSS config or MUI `ThemeProvider`/`createTheme`/`CssBaseline`. The `index.html` entry point loads `corp-src/corp.tsx`. `App.tsx` carries `TODO: Remove fontSize and fontFamily from all Typography components and rely on theme defaults instead`, which is the direction this plan takes.

### Where the styles actually live (initial audit baseline)

Essentially all styling is **inline MUI `sx` props** in TSX. Measured 2026-10-07 across `cards/`, `components/` and `App.tsx` (36 non-test files):

- 764 `sx={{ … }}` blocks (largest: `AccessPassCard` 57, `GlobalGroupsCard` 53, `RepoDetail` 52, `CreateDomainCard` 39, `WebDeployCard` 37)
- 753 hard-coded hex colours
- 298 `"N.NNrem"` font sizes
- 153 `...mono` spreads and 67 literal `IBM Plex` references
- 28 hand-written `linear-gradient` backgrounds, 2 `style={…}` props
- 95 `onClick` handlers, 24 `TextField`/`Select`/`Checkbox`/`Switch` controls

Shared pieces that exist today:

- `config/styles.ts` holds four shared style objects, imported by about 14 files:
  - `MONO` (IBM Plex Mono font family)
  - `labelSx` (small field label, `#94a3b8`, normal sentence case)
  - `sectionLabelSx` (section heading, normal sentence case)
  - `refreshBtnSx` (the "Refresh" text button)
- `config/cardLayout.ts` holds the responsive minimum card width (`CARD_MIN_W`), page maximum width (`EXPANDED_W`), plus `groupSx` and `groupLabelSx` (a second home for styling and more hex colours).
- `components/Card.tsx` is the shared card shell. It owns the status icon map and two hex maps (`BORDER`, `ICON_COLOR`), and styles the shell, header, summary and locked panel inline. The header is a clickable `Box` with no role, `tabIndex`, key handler or `aria-expanded`; the chevron `IconButton` has no label. This is the highest-leverage file to fix.
- `App.tsx` sets the page-level font and colours inline (`#f8fafc` background, `#0f172a` text, IBM Plex Sans) and the intro panel inline.
- Other shared components (`Header`, `RestoreToast`, `SaveButton`, `RefreshButton`, `ViewLink`, `VariablesCard`, `SecretsCard`) style themselves inline. `VariablesCard` and `SecretsCard` also reach into MUI internals with `"& .MuiInputBase-root"` selectors.

### Fonts and type sizes currently in use

The active installer does not yet have one consistent font cascade. The following lists the declared stacks and explicit sizes in the running `corp-src` UI; archived components are not included. IBM Plex families are referenced but are not loaded by a web-font link or `@font-face`, so they render only when available on the user's system and otherwise fall back.

| Surface / elements | Font family currently used | Explicit text sizes and notes |
|---|---|---|
| `body` (`index.css`) | `sans-serif` | No global font size is set. |
| App root (`App.tsx`) | `"IBM Plex Sans", sans-serif` | No font size is set on the root. Descendants can override the inherited family. |
| MUI `Typography` defaults | `sans-serif` | MUI variant defaults apply where a component has no explicit `fontSize`; individual components frequently override them. |
| Card title and summary (`Card.tsx`) | `'IBM Plex Mono', monospace` via `...mono` | Title `0.8rem` weight 600, nowrap with ellipsis; summary `0.72rem`, nowrap with ellipsis. |
| Card content (intro, labels, captions, buttons, errors) | Mixed: intro text inherits the App root (IBM Plex Sans); labels, buttons and inputs use `...mono` | Intro `0.78rem`; labels `0.68rem`; captions `0.7-0.75rem`; errors `0.72-0.78rem`; buttons `0.72-0.85rem`; inputs `0.8rem`. |
| Page header | MUI Roboto-based sans for its title; IBM Plex Mono for the `ZB` mark | Title: `0.95rem`; mark: `0.7rem`. |
| Other card/component content | MUI/default sans or IBM Plex Mono, depending on the individual `sx` override | Counts of explicit `rem` sizes: `0.72` x58, `0.75` x57, `0.78` x44, `0.68` x37, `0.8` x31, `0.7` x21, `0.65` x12, `0.62` x11, `0.85` x9, others fewer. Thirteen distinct values, none shared through a scale. |

The size inventory above describes text. Icon `fontSize` values are separately set in several components (commonly 10–16px), and are not text sizes. Values not explicitly listed on an element come from browser or MUI defaults.

### Palette actually in use

The palette is Tailwind slate/blue/orange/green/red, hard-coded as hex. The most frequent values:

| Colour | Uses | Role |
|---|---|---|
| `#94a3b8` | 77 | muted text / labels (fails contrast, see section 5) |
| `#2563eb` | 54 | primary blue |
| `#cbd5e1` | 53 | disabled / muted icon |
| `#64748b` | 47 | secondary text |
| `#1d4ed8` | 46 | primary hover |
| `#e2e8f0` | 42 | borders |
| `#ef4444` | 40 | error |
| `#d97706` | 37 | warning text |
| `#0f172a` | 34 | strong text |
| `#475569` | 32 | body text |
| `#f1f5f9` | 30 | surface |
| `#93c5fd` | 21 | card hover border |

Interactive card headers and outlined actions use a subtle background tint blended from their hover border color, rather than a neutral gray hover fill. Keep semantic hover treatments such as primary button gradients and destructive actions intact.

### Issues found

1. There is no shared styling layer: every value is an inline literal, so a global change (colour, type size, radius) means editing hundreds of sites.
2. Tokens are duplicated. The same hex and rem values are repeated across 764 `sx` blocks. `styles.ts`, `cardLayout.ts` and `Card.tsx` each hold a different slice of the token set.
3. Layout constants live in TS only, so CSS cannot reuse them.
4. Repeated patterns are re-declared per card: the gradient primary button (28 gradients), intro text, caption text, link-with-icon rows, error text. See `cards/AzureLogin/AzureLoginCard.tsx`.
5. IBM Plex Mono and IBM Plex Sans are referenced 67 times but **never loaded**. `index.html` has no font link and no `@font-face` exists, so fallback fonts render unless the user has the fonts installed.
6. There is no MUI theme, so MUI components use default styling with per-instance overrides, and some files target MUI internals (`.MuiInputBase-root`, `&.Mui-disabled`).
7. Dead code: `App.css`, `NavBar.tsx`, `SessionOverlay.tsx` (no importers).

## 2. Findings on "card stylesheets into app.css"

There are no per-card stylesheets to merge. Cards are styled inline. Standardising therefore means building one shared styling layer and deleting the inline duplicates, not moving files.

## 3. Recommended approach

**Decision: MUI theme first, one small global stylesheet second.** The whole UI is MUI, so a single `createTheme` is the least-code way to centralise tokens, and it removes the need to run a parallel CSS-class system next to Emotion (which would make the ordering problem permanent).

1. **One theme** (`corp-src/theme.ts`), enabled with CSS variables and a color-scheme selector, provided once in `corp.tsx` with `CssBaseline`. It owns:
   - **Palette**: persisted light and dark schemes with slate/blue/orange/green/red tokens, accessible ordinary text shades (`text.primary`, `text.secondary`, `text.muted` >= 4.5:1) and semantic `success|warning|error|info` card status colors. System preference is the default; reported light and dark are both honored, and unavailable preference detection falls back to dark. Explicit Light/Dark choices persist. Accepted exception: muted card titles may be below 4.5:1; status summary text uses dark shades in light mode and corresponding high-contrast shades in dark mode.
   - **Typography**: one UI sans stack, one mono stack (for IDs and command output only), and a small scale mapped to MUI variants (`h1`-`h3`, `body1`, `body2`, `caption`, plus a `overline` for field labels).
   - **Shape and shadow**: radius 8/10, one card shadow.
   - **Component defaults/overrides** for `MuiButton` (no uppercase, the gradient primary as `variant="contained"`), `MuiTextField`/`MuiSelect` (size small, label wiring), `MuiLink`, `MuiTypography`, `MuiChip`.
2. **A handful of shared components** replace repeated `sx` blocks: `Card` (restyled), `CardIntro`, `FieldLabel`, `Caption`, `ErrorText` (`role="alert"`), `StatusText`, `ExternalLink`, plus the existing `SaveButton`, `RefreshButton`, `ViewLink`.
3. **`sx` is reserved for layout and genuinely dynamic values** (flex/gap/margins, widths). No hex colours, no `fontFamily`, no `fontSize` in `sx`; this is the existing `App.tsx` TODO.
4. **`App.css` becomes the only stylesheet** (replacing the dead starter content, imported once from `corp.tsx`): global `:focus-visible` ring, `prefers-reduced-motion`, `.visually-hidden`, `[data-sensitive]` helpers, `--card-w` and `--card-w-expanded`. Nothing component-specific.
5. **Emotion ordering**: with a theme and no competing component classes, the ordering problem disappears. If a global rule must override MUI, put it in `@layer` and use `StyledEngineProvider enableCssLayer`.
6. **Guard against regressions.**
   - Keep `data-id` and `data-sensitive` attributes, `card-<id>` ids, button/link accessible names and DOM nesting where Playwright specs use `.locator("..")`/`.locator("../..")` (see section 0). Run `pnpm test` after each step. The project owner will run the Playwright mock tests manually after each step.
   - Compare before and after screenshots at desktop and mobile widths.

### UX recommendation: typography and hierarchy

The current screen mixes the system UI stack in `index.css`, IBM Plex Sans on the app root, and IBM Plex Mono across card titles, controls, and buttons. The Plex fonts are referenced but are not loaded, so the displayed face can vary by machine. The widespread monospace styling also makes ordinary instructions and actions denser and less familiar to scan.

**Recommendation:** use only the generic `sans-serif` family for main interface content (including labels, buttons, headings, and prose), and `monospace` for technical elements that benefit from fixed-width alignment (for example IDs, command output, and code). Do not add other font families or use monospace for ordinary UI copy. This avoids web-font downloads and makes the task-oriented content easier to scan.

Define a small shared type scale and semantic roles rather than choosing sizes per component:

| Role | Recommended size | Use |
|---|---:|---|
| Page title | 1rem | App name or page-level heading |
| Card/section heading | 0.875–1rem | Card titles and section headings |
| Body | 0.875–1rem | Instructions and primary explanatory copy |
| Supporting | 0.75–0.875rem | Helper text, captions, and secondary actions |
| Metadata | 0.75rem | IDs, timestamps, and other secondary details |

Use a body line-height around 1.5–1.6, regular weight for prose, and semibold weight for headings. Keep labels distinct through weight and spacing rather than making them monospace. Keep all text between 0.75rem and 1rem. Preserve `rem` units, allow text to wrap, and avoid truncating instructions or error messages.

Apply the scale through CSS variables and MUI theme defaults so CSS classes and `sx`-based components render the same roles consistently. Migrate incrementally: first the page shell and shared card components, then individual cards. Do not redesign card layout and typography in the same step unless screenshot comparison confirms the combined change remains easy to scan.

### Scope and trade-offs

- A full migration touches 764 `sx` blocks in 36 files. Most are mechanical; the theme and shared components do the heavy lifting, so each card shrinks to layout-only `sx`.
- Smallest valuable first PR: steps 1-5 in section 7 (theme, global CSS, `Card`, `ViewLink`, `Header`). It fixes the worst accessibility problems for every card at once.
- A colour-only pass (replace hex literals with theme palette keys) is lower risk but leaves the font and structure problems, so do it per card as part of step 8, not as a separate project.

## 4. Security of the inline styles

### Current state

- Styles are MUI `sx` props, which Emotion compiles into CSS classes. Values are static literals.
- In the card and component code I found no `dangerouslySetInnerHTML`, no `innerHTML`, and no raw `style={…}` built from user data. The style props are not an injection route.
- `ViewLink` renders an anchor through MUI `Button` with `href`, `target="_blank"` and `rel="noopener noreferrer"`; it does not call `window.open`.
- No CSP is configured in the UI document or Vite build configuration. The installer frontend is uploaded to Azure Storage static website hosting by Web Deploy; `deploy/` provisions the backend Function App, not the frontend host. Whether production puts an edge/CDN in front of the static website remains unconfirmed.

### Real exposure: CSP and runtime style injection

- Emotion injects `<style>` tags at runtime. A CSP that blocks inline styles would therefore need `style-src 'unsafe-inline'`, or a per-request nonce. A static host cannot provide a per-request nonce.
- A nonce must be provided by the response-serving layer and passed to Emotion through a `<CacheProvider>` configured with the `nonce` option. `corp.tsx` also sets CSS custom properties through `rootElement.style`, which is an inline style attribute and must be included in the CSP decision.

### Lower-level risks (none present today)

- Never interpolate untrusted values (tenant names, repo names, API responses) into a style string, a `url()` or a CSS selector.
- Most provider links are built from fixed HTTPS origins. Runtime remote-terminal values are now checked at their trust boundaries: runner device-code links must be HTTPS without embedded credentials, and the negotiated socket URL must be WSS on an Azure Web PubSub hostname. General shared link components still accept arbitrary strings; retain scheme/host checks at their call sites when values are not from fixed-origin helpers.

### How standardisation helps

Standardisation helps modestly, mostly by making a strict CSP possible:

- **Strict CSP.** Static CSS in a shared stylesheet allows `style-src 'self'`. Dropping `'unsafe-inline'` also requires the remaining MUI and Emotion runtime styles to be handled by a nonce or by build-time extraction.
- **Smaller attack surface.** A theme plus a fixed set of shared components replaces 764 inline style objects, so review is simpler.
- **Auditability.** The `data-sensitive` attributes can be handled by one rule such as `[data-sensitive]` blur, for screenshots and recordings.

Standardisation alone does not fix anything. MUI still injects some runtime styles, so a CSP needs the nonce or the `unsafe-inline` allowance until Emotion is replaced or extracted.

### Related hardening to consider

- Add `frame-ancestors 'none'` (or `X-Frame-Options: DENY`). The app handles Azure and GitHub tokens, so clickjacking is a bigger risk than styles.
- Add a full CSP (`default-src 'self'`, with explicit `connect-src` for the Microsoft, Azure and GitHub endpoints) plus `Referrer-Policy` and `X-Content-Type-Options`. These are usually set as host headers, since a `<meta>` CSP cannot set `frame-ancestors`.
- The UI uses generic `sans-serif` and `monospace` stacks; no external font host is required.

## 5. Accessibility recommendations

The counts below are the initial 2026-10-07 baseline from `cards/`, `components/` and `App.tsx`; `Card.tsx`, `ViewLink.tsx`, `Header.tsx`, `AzureLoginCard.tsx` and `App.tsx` were reviewed in detail.

Measured baseline signals: 95 `onClick` handlers (the card header and requirement rows in `Card.tsx` were `Box`es with `onClick`), 8 `aria-*` attributes, 3 `tabIndex`, 4 `onKeyDown`, 0 `role=`, 0 headings, 0 landmarks, and 0 `<img>`. There was no `:focus-visible` rule or `prefers-reduced-motion` handling. No `eslint-plugin-jsx-a11y` or axe tooling was installed. Of 24 form controls, only 36 `label=`/`aria-label`/`inputProps` hits existed across the whole set, and field labels were mostly a `Typography` placed beside the control.

| # | Priority | Issue | Fix |
|---|---|---|---|
| 1 | High | **Card header wasn't keyboard accessible (resolved for the shared card shell).** | The title and chevron are now separate semantic toggle buttons with `aria-expanded`/`aria-controls`; the chevron has an accessible label. The region is labelled by the card heading. Audit remaining non-semantic click targets separately. |
| 2 | High | **Card toggles lacked visible keyboard focus and showed an unwanted click ripple (resolved for the shared card shell).** | Card title and chevron toggles disable MUI ripples and render an explicit focus outline. `App.css` also provides a global `:focus-visible` outline for other controls. |
| 3 | High | **Card status was conveyed by icon and colour only (resolved for the shared card shell).** | Status glyphs are hidden from assistive technology; the title toggle's content-derived accessible name includes its visible title and summary, followed by visually hidden status text, with "Locked" taking precedence. Live regions for dynamic progress, success and error messages such as `loginError` remain open. |
| 4 | High | **Colour contrast.** Muted card titles (`#94a3b8`) remain below 4.5:1 on white; the original orange/green summary shades were also low contrast. | Status summaries now use dark palette shades. The accepted exception is limited to intentionally muted card titles; ordinary instructional and status text targets 4.5:1. |
| 5 | Medium | **Small text.** Sizes are 0.68–0.8rem (about 11–13px). Truncated titles and summaries use ellipsis. | Keep text within 0.75–1rem. Keep `rem` units so browser zoom works. Add a `title` or tooltip for truncated text and expose the full text to screen readers. |
| 6 | Medium | **Reduced-motion handling was missing (resolved globally).** | `App.css` reduces CSS animation and transition durations, including card transitions, when `prefers-reduced-motion: reduce` is active. |
| 7 | Medium | **`ViewLink` was a `Button` calling `window.open` (resolved).** Its visible label remains hidden below the `sm` breakpoint but its accessible name remains available. | `ViewLink` renders a secure `<a href target="_blank" rel="noopener noreferrer">`; links expose "(opens in new tab)" in their accessible name, and inline text links are underlined for distinction. |
| 8 | Medium | **Labels aren't tied to controls.** `labelSx` is applied to a `Typography` beside the `Select`/`TextField`. | Use `InputLabel`/the `label` prop, or `aria-labelledby`. |
| 9 | Low | **Page structure (resolved in the installer shell).** | The shell has semantic header/main/footer landmarks, a skip link, one page `h1`, a named deployment-progress section with an `h2`, and an `h2` for help/information. There is no separate "Deployment steps" heading. |
| 10 | Low | **Forced colours / high contrast.** | Test with `forced-colors: active` and keep borders on cards and buttons so they stay visible. |
| 11 | Medium | **Plain-text instructions were `<br />`-separated (resolved in the installer shell).** | Prerequisites use an ordered list, the GoDaddy URL is a secure `ExternalLink`, and the intro uses body typography. |
| 12 | Medium | **Dynamic status and errors lacked live regions (resolved across migrated cards).** | Progress/success states use `role="status"`, errors use `role="alert"`, and shared status/error components provide the semantics; progress spinners have accessible names. |
| 13 | Medium | **`data-sensitive` content can be masked for screenshots/recordings (implemented as opt-in).** | Set `data-mask-sensitive="true"` on the document root to blur `[data-sensitive]` content; the default UI remains unchanged. |

## 6. Other considerations

- **Fonts.** Follow the recommendation above: `sans-serif` is the UI face and `monospace` is for technical values only. Remove unloaded IBM Plex references and other font overrides instead of adding font downloads.
- **Theming and color schemes.** The MUI theme exposes tokens as CSS variables and defines both light and dark schemes. The header toggle switches schemes; MUI persists the mode and selected color scheme.
- **MUI and CSS ordering.** With the theme-first approach there are no competing component classes. If a global rule must override MUI, use CSS `@layer` with `StyledEngineProvider enableCssLayer`.
- **Responsive card layout (2026-10-09).** Card groups use an auto-fitting grid with a 360px minimum column width: columns grow to fill available space, then naturally reduce from three to two to one as the viewport narrows. Expanded cards span the group width. The page remains capped at 1280px for readability.
- **Test selectors.** Keep the `data-id` and `data-sensitive` attributes and the `card-<id>` ids, since tests and the Playwright suites depend on them. `data-a11y-contrast-exception` is reserved for non-interactive muted card titles.
- **Bundle and performance.** Moving static styles out of runtime Emotion reduces JS work and style recomputation. Check the bundle size before and after.
- **Linting and CI (implemented in Step 9).** Recommended `eslint-plugin-jsx-a11y` rules apply to installer TSX; `no-restricted-syntax` blocks raw hex colors, `fontFamily`, and `fontSize` inside JSX `sx` in `cards/` and `components/`; `@axe-core/playwright` scans collapsed, expanded, and locked page states. The scan excludes only the explicitly marked, non-interactive muted-title and status-summary spans from its analysis tree; no axe rules are disabled. Consider Stylelint for the shared CSS separately.
- **Documentation.** Keep theme tokens, global helper classes, and the explicit muted-title axe contrast exception documented here and mirrored in the installer `README.md`.

## 7. Step-by-step plan

Each step is one reviewable change that leaves the app working. After every step run `pnpm lint` and `pnpm test`. The project owner will manually run the Playwright mock tests and review desktop/mobile screenshots after each step.

### Step 0. Baseline

- Use the existing desktop/mobile visual baselines under `pwtests/corp-src/snapshots/mock-tests`; the mock specs call `expectSnapshot` to compare card states against these PNGs. Do not create a duplicate screenshot set. Note any important card state that is not represented by an existing baseline.
- The project owner runs the Playwright mock tests manually; no Playwright run is required as part of this plan.
- **Baseline run (2026-10-08): partial.** Ran the `Test Corp` project against `pwtests/corp-src/mock-tests` with `--no-deps`, `BASE_URL=http://localhost:5173`, and a temporary dummy `VITE_APPINSIGHTS_CONNECTION_STRING` (no `.env` or source files changed). Result: 46 passed, 18 failed. Failures were confined to `BackendDeployCard` (10), `CreateDomainCard` (2), and `RemoteTerminalInfraCard` (6); their flows were blocked because `--no-deps` skipped the auth setup projects, leaving prerequisite cards locked. The focused Azure Login test and screenshot assertions reached by the suite matched the existing baselines. Do not interpret the 18 failures as styling regressions; rerun with required auth state available if full behavioral coverage is needed.
- Record the font rule: only `sans-serif` and `monospace` are allowed, with `monospace` reserved for technical elements. Do not add web-font downloads or other font families.
- Keep theme typography variants between 0.75rem and 1rem.

### Step 1. Remove dead code and fix fonts

- Delete `corp-src/App.css` starter content, `components/NavBar.tsx` and `components/SessionOverlay.tsx` (confirm no importers first; `knip` at the repo root can verify).
- Remove all `IBM Plex` references (67), and remove other UI font overrides. Use only `sans-serif` and `monospace`, with `monospace` only for technical values.
- **Completed (2026-10-08).** Deleted the unused starter stylesheet and components; added the MUI sans-serif default; switched shared text styling to `UI_FONT` and added `MONO_FONT` for technical values. The focused Azure Login desktop mock passed and its existing start/end snapshots matched. No snapshot baselines were updated.

### Step 2. Add the theme

- Create `corp-src/theme.ts` (`createTheme`, `cssVariables: true`) with the palette, typography scale, shape and component overrides from section 3. Map existing colours to tokens: `#0f172a` text.primary, `#475569` text.secondary, `#64748b` text.muted (never lighter for ordinary text), `#2563eb`/`#1d4ed8` primary main/dark, `#ef4444`/`#dc2626` error, `#d97706` warning, `#22c55e` success, and `#e2e8f0` divider. The card status summary shades `#ea580c` (warning) and `#16a34a` (success), along with muted card text `#94a3b8`, are the accepted contrast exceptions recorded below.
- Wrap the app in `ThemeProvider` and `CssBaseline` in `corp.tsx`. Visuals should barely change.
- **Completed (2026-10-09).** Added the CSS-variable MUI theme with the shared palette, type scale, shape, button/form/link/typography/chip defaults and technical monospace elements. The existing `ThemeProvider`/`CssBaseline` wrapper was already in place. `pnpm build`, focused theme lint and the Azure Login desktop/mobile mock (4 tests) passed; existing screenshots matched and were not updated. Full `pnpm lint` and `pnpm test` still report failures in untouched files (existing lint violations, Access Pass telemetry test setup, and a browser-test module load failure).
- **Typography floor updated (2026-10-09).** Set the root and theme base to 16px/1rem, raised theme variants and MUI text-control defaults to at least 1rem, and raised explicit sub-1rem `fontSize` overrides across `corp-src`. Metadata uses a 0.875rem caption base. **Scale adjusted (2026-10-10):** theme variants now range from 0.75rem to 1rem; keep all text in that range. Update relevant visual baselines only after reviewing the resulting UI.

### Step 3. Global stylesheet

- Reuse `App.css` for global rules only: `:focus-visible` ring, `prefers-reduced-motion`, `.visually-hidden`, `--card-w` and `--card-w-expanded` (set from `cardLayout.ts` in `corp.tsx` so there is one source of truth). Import it once from `corp.tsx`, and fold `index.css` into it.
- **Completed 2026-10-14.** Added `corp-src/App.css`, folded in the reset from `index.css`, imported it once from `corp.tsx`, and removed `index.css`. It now owns the global focus-visible outline, reduced-motion overrides, `.visually-hidden`, and an opt-in sensitive-value mask activated by `data-mask-sensitive="true"` on the document root. `corp.tsx` sets `--card-w` and `--card-w-expanded` from `CARD_MIN_W` and `EXPANDED_W`; the grid and page max width consume those variables. The `@xterm/xterm/css/xterm.css` import remains as third-party terminal styling, not a competing app stylesheet.
- **Post-step-3 follow-up (2026-10-13): hover effects.** Card hover feedback moved from a card-border colour shift to header-only tinting via `borderHoverTint(...)`, so hover colour now tracks each card's status border and keeps locked/unavailable cards muted.
- **Post-step-3 follow-up (2026-10-13): card sizing.** Replaced fixed-width card sizing (`CARD_W` + breakpoint-based flex alignment) with responsive grid sizing: `CARD_MIN_W = 360`, `repeat(auto-fit, minmax(min(100%, 360px), 1fr))`, card `width: 100%`, and expanded cards spanning the full grid (`gridColumn: "1 / -1"`), while keeping `EXPANDED_W = 1280` as the page-level max width.

### Step 4. Fix `Card.tsx` (largest accessibility win)

- **Completed 2026-10-14: card interaction/accessibility.** The title is an `h3` containing a `ButtonBase`; the adjacent chevron is a separate, labelled `IconButton`. Both controls expose `aria-expanded` and `aria-controls`, and the existing content wrapper is a `role="region"` labelled by the heading. Locked requirement rows are semantic buttons and preserve the existing multi-card navigation behavior. Status icons are hidden from assistive technology, and the title button's accessible name includes the status (`Locked` takes precedence). Stable card IDs and visible title text are preserved.
- Both card toggles disable MUI's click ripple to avoid a gray flash, and provide an explicit blue keyboard-focus outline. The optional action remains outside the title toggle; `ViewLink` no longer relies on stopping event propagation.
- **Completed 2026-10-14: theme colors and text behavior.** Card status, border, summary, surface, requirement and icon colors now come from typed `theme.palette.card` tokens, retaining their previous values. Card titles remain visually single-line but expose the complete title through a `title` attribute; summaries wrap and no longer truncate.
- **Contrast follow-up (2026-10-18).** The original semantic status-summary exception was removed by moving those summaries and other status text to dark palette shades. Only intentionally muted card titles retain the documented below-4.5:1 exception.
- **Card face sizing follow-up (2026-10-18).** Collapsed summaries now use one-line ellipsis, matching card titles and keeping header heights consistent when signed-in summaries are long. The full summary remains in the DOM and title toggle accessible name, and is available through the `title` attribute. The `CardAccessibility` Playwright spec covers height and accessible-name retention.
- **Verification (2026-10-14):** focused browser checks for global CSS rules, keyboard title/chevron toggles, no ripples, title tooltip, wrapping summaries and locked prerequisite navigation passed at desktop and mobile (6/6). The complete Azure Login mock spec passed 10/10 with existing snapshots unchanged. `pnpm build` passed. Focused ESLint passed for `corp.tsx`, `cardLayout.ts`, `theme.ts` and `Card.tsx`; linting `App.tsx` also reports `react-refresh/only-export-components` at its wrapped default export.
- **Full-suite check (2026-10-14):** `pnpm test` reported 250 passed and 2 failed; both failures are Access Pass telemetry expectations in `useAccessPassCard.test.tsx`. `pnpm lint` remains red with 37 errors and 5 warnings across the UI, including `App.tsx` and unrelated component findings. The Playwright `.mts` spec also has language-service import-extension diagnostics, but the Playwright runner executes it successfully.

### Step 5. Page shell

- `App.tsx`: `<header>`, `<main>`, skip link, one `h1`, a deployment-progress section with an accessible name and `h2`, the card grid, and an intro with a real list and link. Move page-root colors into the theme/`CssBaseline`.
- `Header.tsx`: use the theme for the mark and title; keep `document.title` as the canonical title and render it as the page `h1`.
- `ViewLink.tsx`: retain the secure anchor behavior (`target="_blank" rel="noopener noreferrer"`) and add "(opens in new tab)" to the accessible name while keeping the visible label.
- **Implemented (2026-10-14; footer added 2026-10-15).** Added a focus-revealed skip link, semantic header/main landmarks, page `h1`, named deployment-progress section and heading, ordered prerequisites and GoDaddy link. The page uses theme background/text tokens. Shared View links announce their new-tab behavior. Existing card order, IDs, data hooks, and card heading structure are preserved. A semantic footer groups help and information links and includes a labelled keyboard-shortcuts dialog.
- **Verification (2026-10-14).** `pnpm build` passed. The focused shell/card keyboard Playwright check passed at desktop and mobile (2/2). The complete Azure Login mock spec had 9 passed and 1 failed: the mobile signed-in end-state snapshot differs in the Azure card's signed-in row; the snapshot was not updated. Focused ESLint reports only the existing `react-refresh/only-export-components` finding in `App.tsx`; the `.mts` spec is ignored by the current ESLint configuration. Full `pnpm test` had 249 passed and 3 failed in the existing Access Pass telemetry tests (`appInsights` is null). Full `pnpm lint` remains at 37 errors and 5 warnings across the UI, consistent with the existing lint baseline.

### Step 6. Shared building blocks

- Replace `config/styles.ts` (`MONO`, `labelSx`, `sectionLabelSx`, `refreshBtnSx`) and `groupLabelSx` with theme variants/components, and re-export thin shims during migration so cards can move one at a time. Delete the shims at the end of step 8.
- Add `CardIntro`, `FieldLabel` (wired to controls), `Caption`, `ErrorText` (`role="alert"`), `StatusText` (`role="status"`), `ExternalLink` in `components/`.
- Make the gradient primary button a single `MuiButton` contained variant, removing the 28 copies.
- Replace `"& .MuiInputBase-root"` selectors in `VariablesCard`/`SecretsCard` with theme `MuiTextField`/`MuiOutlinedInput` overrides.
- **Implemented (2026-10-15).** Added all six shared components; wired `FieldLabel` to variable and secret inputs; used `CardIntro` and secure `ExternalLink` in the page intro; added theme `fieldLabel`/`sectionLabel` typography variants while retaining style shims and removing unused `groupLabelSx`. Centralized editor styling in the theme via the `corpEditor` class, including dirty/error border states, and removed local primary contained-button color/gradient overrides. Existing destructive styling and intentional per-button spacing/shadows remain.
- **Verification (2026-10-15).** `pnpm build` passed; the focused shared-building-block browser test passed (1/1). Full `pnpm test` had 250 passed and 3 failed in the existing Access Pass telemetry tests (`appInsights` is null). Full `pnpm lint` remains at 37 errors and 5 warnings; focused lint found only existing findings in `App.tsx`, `AccessPassCard.tsx`, and `AzureAppRegistrationCard.tsx`. The Azure Subscription mock run had 7 failures and 3 scenarios did not run: reached snapshot comparisons differ after the intended editor/button styling changes, while auth-dependent scenarios were blocked. Snapshot baselines were not updated; review desktop/mobile diffs before accepting them.

### Step 7. Pilot card

- Migrate `AzureLoginCard` completely (hex, `fontSize`, `fontFamily` and shared patterns removed from `sx`). Review the diff and screenshots; adjust the theme and building blocks before scaling.
- **Completed (2026-10-16).** Migrated Azure Login copy and status/error messages to shared components and theme variants; removed card-local hex colors, font overrides, `UI_FONT`, and label-style shims. Tenant labels now reference the Select or manual tenant input while the help link remains a separate secure external link. Added a semantic error contained-button theme variant for sign-out and the theme-backed `corpTechnicalInput` class for manual tenant IDs. Restored the `MONO` compatibility alias used by `PrivateFrontendInfraCard` so the installer builds during the incremental migration. Existing IDs, data hooks, and flow/layout remain intact. Reviewed and updated the Azure Login desktop/mobile snapshots for the intended shared typography and link styling.
- **Verification (2026-10-16).** Focused ESLint passed for the changed TypeScript files; the Azure Login hook unit tests passed (7/7); `pnpm build` passed; the Azure Login mock spec passed (10/10) with updated snapshots. An initial unfiltered `pnpm test` attempt also surfaced the existing three Access Pass telemetry failures (`appInsights` is null); this pilot's focused hook tests and browser checks pass.
- **Azure subscription mock-test follow-up (2026-10-16).** Updated `pwtests/util/testHelper.ts` so card snapshots wait for DOM readiness and fonts without requiring `networkidle`. Updated `pwtests/corp-src/util/mockTestHelper.mts` to include `VITE_AZURE_TENANT_ID` in saved mock variables and to locate the save button by its dynamic variable count. The Azure Subscription and Azure App Registration mock specs now use the dynamic save-button name and assert it is enabled before clicking; the subscription suite also has a 120-second describe timeout. These changes account for the additional tenant variable introduced by the Azure Login pilot.

### Step 8. Migrate the remaining cards, one PR each

Migrate one card/component per PR, keeping directly coupled feature files together. Follow dependency and fan-out order:

1. Shared building blocks: `StepRow`, `VariablesCard`, `SecretsCard`, `CloudVariableDetail`, `EnvSecretsDetail`, `CopyRow`, `RestoreToast`. Migrate editors before their detail consumers, and `CopyRow` before Access Pass. Check out-of-scope consumers such as `PrivateFrontendInfraCard` without expanding this step to them.
2. Authentication and setup: `GithubLoginCard`, `AwsLoginCard`, `AwsSetupCard`, `AzureSubscriptionCard`, `AzureAppRegistrationCard`. Keep AWS Setup after AWS Login and App Registration after Subscription.
3. Infrastructure: `CoreInfraCard`, `CreateDomainCard`, `RemoteTerminalInfraCard`.
4. Coupled flows: `StageCard`/`StagePlanDetail`/`RemoteTerminal` together; `RepoCard`/`RepoDetail`/`EnvDetail`/`EnvBranchDetail` together.
5. Remaining cards: `BackendDeployCard`, `WebDeployCard`, `GlobalGroupsCard`, and `AccessPassCard`. Migrate Backend/Web after Repo and Access Pass after CopyRow and the Azure account/tenant path.

For each unit, use theme variants and shared building blocks, keep `sx` for layout/dynamic values, label controls, add live regions for status/errors, preserve IDs/test hooks/DOM contracts, and keep text sizes between 0.75rem and 1rem. Run focused tests, lint and build; run the matching mock-browser spec where available and review desktop/mobile snapshots before updating baselines. Also run `pnpm lint` and `pnpm test` as documented, distinguishing recorded unrelated failures from regressions.

#### Progress (2026-10-16)

- **StepRow migrated.** Status/progress colors now use theme palette roles; the UI font override was removed without changing row markup or status behavior. Changed-file ESLint and `pnpm build` passed; Core Infra/Create Domain hook tests passed (35/35); Core Infra mock flow passed (4/4) with its mobile snapshot matching. The full UI suite was 250 passed/3 failed (existing Access Pass telemetry `appInsights` null failures); full lint reported 34 errors/5 warnings outside StepRow.
- **VariablesCard migrated.** Replaced local colors and monospace styling with theme roles, labeled clear/revert controls, and added status/error live semantics. Extended `SharedBuildingBlocks.browser.test.tsx` to cover its label, action names, and announcements. Changed-file ESLint and `pnpm build` passed; shared building-block/editor tests passed (11/11), and the focused shared-building-block test passed (1/1). Azure App Registration mock flow was 11 passed/1 failed: the mobile missing-subscription-role scenario timed out in mock Azure sign-in/setup and did not reach a VariablesCard assertion; its connection-save-failure mobile snapshot matched. Full UI tests again reported 250 passed/3 existing Access Pass telemetry failures; full lint reported 34 errors/5 warnings outside the changed files. No snapshots were updated.
- **SecretsCard migrated.** Status fills, borders, text and icons now use theme tokens/alpha tints. Named the reveal, discard, edit and dialog-close controls; linked the dialog field to its label; marked pending and input secret values `data-sensitive`; and added status/error announcements while retaining masked-by-default rendering. Extended `SharedBuildingBlocks.browser.test.tsx` to verify masking, explicit reveal, field labeling, action names and error announcements. Focused browser test (1/1), changed-file ESLint and `pnpm build` passed. The Repo mock spec has no secrets-specific scenario; no snapshots were changed. Full UI tests reported 250 passed/3 existing Access Pass telemetry failures; full lint reported 34 errors/5 warnings outside the changed files.
- **CloudVariableDetail migrated.** Replaced local heading/loading/configuration colors and `UI_FONT` with theme roles, exposed loading/configuration status, and replaced the `window.open` button with shared secure `ExternalLink` while retaining its responsive visible label. Focused variable/editor/shared-link tests passed (15/15), changed-file ESLint and `pnpm build` passed. The Core Infra consumer mock flow passed (4/4) with desktop/mobile snapshots matching.
- **EnvSecretsDetail migrated.** Replaced local heading/description/subsection styles with theme typography and semantic palette roles; missing-secret counts now expose live status. Secret loading, encryption, staging and save behavior were not changed. Focused shared-building-block/editor tests passed (15/15), changed-file ESLint and `pnpm build` passed. The component currently has no importers; no snapshots were changed.
- **CopyRow migrated.** Removed label/UI font shims and local colors; retained monospace for the technical value, marked rendered values sensitive, and named the copy action without exposing the value. Extended the shared browser test for masked rendering and its accessible name. Focused browser test (1/1), changed-file ESLint and `pnpm build` passed. Access Pass has no listed mock spec; no snapshots were changed.
- **RestoreToast migrated.** Loading now announces a polite status with an accessible spinner name; warning dismissal has an explicit accessible name. Toast placement/timing remain unchanged. Shared browser test (1/1), changed-file ESLint, diagnostics and `pnpm build` passed.
- **GithubLoginCard migrated.** Replaced local UI font/color overrides with theme roles, used `corpTechnicalInput` for the PAT, added validation/loading/signed-in status semantics and accessible clear/reveal names, and adopted the error button theme variant for sign-out. The PAT remains a password input; adding `data-sensitive` caused the screenshot blur to render as a black bar, so that marker was removed. Hook tests passed (13/13); mock spec passed (6/6) with existing desktop/mobile snapshots unchanged; focused ESLint and `pnpm build` passed. Full UI tests remain 250 passed/3 existing Access Pass telemetry failures; full lint retains existing unrelated findings.
- **AwsLoginCard migrated.** Replaced local type/color styling with theme roles, used `corpTechnicalInput` for access keys/MFA codes, converted documentation links to shared secure `ExternalLink`, and added named secret reveal, login status, MFA warning and error semantics. Credential submission and MFA behavior remain unchanged. Shared building-block test passed (1/1), changed-file ESLint and `pnpm build` passed. No AWS Login-specific unit/mock spec exists. Full UI tests remain 250 passed/3 existing Access Pass telemetry failures; no snapshots were updated.
- **AwsSetupCard migrated.** Replaced local typography/colors with theme roles, wired the IAM role name to its field label, added live save/progress and alert semantics, and converted the connection-detail expander from a clickable `Box` into a labelled `ButtonBase` controlling a region. AWS role creation/autosave logic remains unchanged. Shared building-block test passed (1/1), diagnostics, changed-file ESLint and `pnpm build` passed. No AWS Setup-specific unit/mock spec exists. Full UI tests remain 250 passed/3 existing Access Pass telemetry failures; no snapshots were updated.

#### Step 8 status (checked 2026-10-17)

All Step 8 card migrations are implemented. At the Step 8 checkpoint, `PrivateFrontendInfraCard` remained out of scope; Step 9 subsequently migrated it. The remaining shared-style exports were usage-audited: `MONO` is unused, while `MONO_FONT`, `UI_FONT`, `labelSx` and `refreshBtnSx` still have consumers. Decide whether to migrate those consumers to theme/component defaults or retain the exports as supported shared utilities.

- **Azure Subscription:** Already migrated in the current worktree; focused hook tests passed (6/6). Its mock snapshot is part of the existing dirty worktree and was not changed in this session.
- **Azure App Registration:** Migrated to theme roles, shared labels/statuses, a keyboard-operable connection-details toggle and secure input styling. Hook tests passed (12/12); build passed. Its mock spec had 10 passing and 2 happy-path failures at the preceding Azure Subscription snapshot, before reaching this card. The card's other warning-state snapshots matched. Changed-file lint retains the existing `react-hooks/set-state-in-effect` finding in the auto-expand effect.
- **Core Infra:** Migrated to theme roles, named location controls, and status/error announcements. Hook tests passed (17/17); lint and build passed. Its mock flow had 3 passing and 1 mobile failure. Reviewed and updated the mobile `Happy-path-not-setup-start.png` and `Happy-path-end.png` baselines; the mobile flow then timed out waiting for repository/environment setup before continuing.
- **Create Domain:** Migrated to theme roles and shared status/error components. Hook tests passed (18/18); lint and build passed. Both mock happy paths stopped before the card became actionable because Azure sign-in was not completed; no snapshots changed.
- **Remote Terminal Infra:** Migrated card presentation, admin-consent link and connection-details toggle; retained the terminal-specific `TERMINAL_COLORS`. Lint and build passed. Its mock spec had 2 passing and 4 failures waiting for Azure-dependent prerequisites before reaching the card; no snapshots changed.
- **Stage flow:** Migrated `StageCard`, `StagePlanDetail`, `RemoteTerminal` and action palette roles together; retained terminal-specific colors and technical monospace output. The focused stage-plan tests passed (13/13); lint and build passed. No dedicated Stage mock spec exists.
- **Repo flow:** Migrated `RepoCard`, `RepoDetail`, `EnvDetail` and `EnvBranchDetail`, including accessible environment buttons and secure GitHub links. Hook tests passed (11/11); lint and build passed; the full Repo mock spec passed (10/10). Reviewed and updated three snapshots: desktop/mobile `prod-branch-visible-mock.png` and mobile `clone-failed.png`.
- **Global Groups:** Migrated theme styling, field labels, named actions and semantic membership/add controls. Hook tests passed (31/31); lint and build passed. No card-specific mock spec exists.
- **Access Pass:** Migrated theme styling, status/error announcements, confirmation checkbox labels and external link handling; preserved telemetry calls and `data-id` hooks. The focused hook run had 13 passing and 3 failures in the existing telemetry `appInsights` setup. Changed-file lint reports three existing `react-hooks/set-state-in-effect` findings; build passed. No card-specific mock spec exists.
- **Backend Deploy:** Migrated theme roles and build/deploy status semantics. Lint and build passed. Its mock spec had 2 passing and 8 failures waiting for the Azure-dependent Remote Terminal Infra card before reaching Backend Deploy; no snapshots changed.
- **Web Deploy:** Migrated theme roles, shared external links and async status/error semantics. Lint, diagnostics and build passed. No focused unit or mock spec exists.
- **Full-suite gates:** `pnpm test` reported 251 passed and 2 failed, both Access Pass telemetry `logEvent` expectations (`appInsights` context is null). `pnpm lint` reported 34 errors and 5 warnings across the UI; the changed Step 8 files contribute the recorded Access Pass and Azure App Registration effect findings, while the remaining findings are in other existing files. The final `pnpm build` passed; Vite still reports its existing externalized Node-module and large-chunk warnings.

Step 8 migrations are complete. Follow-ups are to rerun Azure-dependent mock flows when required auth/setup state is available, and to resolve or separately baseline the recorded Access Pass telemetry failures and existing lint findings. `PrivateFrontendInfraCard` was migrated in Step 9; do not treat it as still out of scope.

### Step 9. Guardrails

- Add `eslint-plugin-jsx-a11y` to `eslint.config.js`.
- Add `@axe-core/playwright` scans of the main page (collapsed, one card expanded, one locked) to the mock tests.
- Add a lint rule (`no-restricted-syntax`) forbidding hex literals, `fontFamily` and `fontSize` in `sx` under `corp-src/cards` and `components`.
- Add a Playwright check that Tab reaches every card header and expands it with Enter/Space.

- **Implemented (2026-10-17).** Added the recommended jsx-a11y rules and `@axe-core/playwright`; introduced scoped syntax restrictions for colors, font families and font sizes in JSX `sx`; migrated the remaining card/component violations, including `PrivateFrontendInfraCard`, to theme typography and palette tokens. Removed automatic focus from three fields flagged by jsx-a11y. Added shared axe scans for the collapsed page, expanded Azure Login card and expanded locked card, plus a full card-header Tab/Enter/Space sweep. Card toggle accessible names now derive from visible title/summary text and include the status as visually hidden text. Inline text links are underlined for distinction; only explicitly marked non-interactive muted-card titles and semantic status summaries are excluded from the axe analysis tree, matching the documented contrast exception.
- **Verification (2026-10-17).** The new accessibility spec passed (4/4); Azure Login mock tests passed (10/10) with existing snapshots unchanged; `pnpm build` passed. The style and jsx-a11y rules report no findings in `corp-src/cards` or `corp-src/components`. Full `pnpm lint` remains at 34 errors and 5 warnings in the existing React Hooks/App findings. Full UI `pnpm test` had 250 passed and 3 failed in the existing Access Pass telemetry tests (`appInsights` is null).

### Step 10. UX validation

- **Not yet validated.** At 200% browser zoom and 320 CSS px, check text/control wrapping, clipping and page-level horizontal overflow; record the terminal's intentional internal scrolling separately. Complete one representative deployment flow with keyboard only. Verify dynamic progress/success/error announcements with a supported screen reader, and test Windows forced-colors/high contrast and reduced motion. Record OS, browser, assistive technology, viewport/zoom, flow and results; fix observed issues before marking complete.
- **Automated partial check (2026-10-17).** The accessibility Playwright spec now checks 320px page reflow, reduced-motion transition suppression and retained card borders under forced-colors emulation. It passes with the existing axe and card-header keyboard checks (5/5). This does not replace 200% browser zoom, a full keyboard-only deployment, or screen-reader verification.
- **Automated preference follow-up (2026-10-22).** System mode follows emulated light/dark preferences and live changes; when `matchMedia` is unavailable, the app falls back to dark. Explicit Light/Dark choices persist across reloads. Forced-colors coverage now checks keyboard focus outline visibility, card boundary/text visibility, native color adjustment, and 320px expanded-card/form bounds; reduced-motion suppression remains covered. The focused accessibility spec passed 11/11. Real 200% browser zoom and Windows High Contrast checks remain manual and open.

### Step 11. Hardening (optional, after the above)

- **Host decision required before implementation.** The frontend is uploaded to Azure Storage static website hosting by Web Deploy; this folder's `deploy/` Terraform provisions the backend Function App and is not the frontend response-header layer. Confirm whether production serves Storage directly or uses Front Door/CDN/another edge. Configure headers at the actual serving layer: choose a CSP compatible with MUI/Emotion and the inline custom-property assignment in `corp.tsx`, add `frame-ancestors 'none'`, `Referrer-Policy` and `X-Content-Type-Options`, then verify the deployed response and application flows. Runtime remote-terminal URL checks are implemented, but generic external-link call sites and full trusted-host policy still need review. The font stack is system-provided; no font hosting work is needed.

### Follow-up status (2026-10-17)

- **Implemented:** app intro/footer/card surface color, border, shadow and radius now use shared theme tokens; global/card focus rings use theme colors; the stale typography TODO, unused `MONO` alias and unused `UI_FONT` export were removed. Letter-spacing overrides now use zero. `MONO_FONT`, `labelSx` and `refreshBtnSx` remain live shared helpers; `borderHoverTint` remains shared behavior.
- **Implemented:** remote-terminal device-code URLs are validated as HTTPS without embedded credentials, and negotiated WebSocket URLs are restricted to WSS on `*.webpubsub.azure.com`; focused parser tests cover malformed and wrong-scheme values.
- **Verification (2026-10-17).** `pnpm build` and focused typechecking passed; remote-terminal URL tests passed (10/10); the accessibility browser spec passed (5/5). Full `pnpm test` passed 253 tests and failed 3 Access Pass telemetry tests because `appInsights` is null. Full `pnpm lint` reports 34 errors and 5 warnings; focused lint passes on touched files except the existing `react-refresh/only-export-components` finding in `App.tsx`. Vite reports its existing externalized Node-module and large-chunk warnings.
- Azure-dependent mock flows still need rerunning when required auth/setup state is available; prior runs did not reach their target cards. Review desktop/mobile snapshots before updating baselines.

### Follow-up status (2026-10-18)

- **Implemented:** the footer shortcut dialog now lists native keyboard behavior and opens with `?` outside editable controls; Ctrl/Meta/Alt combinations are ignored. MUI retains Escape dismissal and focus management.
- **Implemented:** collapsed card summaries use one-line ellipsis to keep card faces a consistent height; complete summary text remains available to screen readers and via the `title` attribute.
- **Verification:** the focused accessibility Playwright suite passed 9/9, Footer ESLint passed, and `pnpm run build` passed. Vite continues to report its existing externalized Node-module and large-chunk warnings.
- Footer Contact and Terms copy remain placeholders; decide whether they are acceptable for this release or provide real content.

### Follow-up status (2026-10-22)

- **Implemented at this checkpoint:** the theme defines light and dark color schemes, with dark mode initially as the default. The header provides a labelled mode toggle; MUI persists the mode and color-scheme selection. The remote terminal follows the active scheme while retaining its terminal-specific palette. The 2026-10-22 browser-preference follow-up below changes the default to System and the control to a three-mode cycle.
- **Documentation alignment:** `UI_UX.md` describes the named deployment-progress section, next-step control, color-scheme toggle and persistence. It no longer describes a separate "Deployment steps" heading. The UI README records the current shell and color-scheme decisions.
- **Verification (2026-10-22):** `pnpm test` and `pnpm run docs:build` passed. `pnpm lint` reports 33 errors and 5 warnings. The focused accessibility Playwright command did not reach test cases because Azure and GitHub Vite client IDs were undefined during module initialization; configure its required environment before retrying. This is a setup failure, not a test assertion result.
- **Still open:** manual 200% zoom, keyboard-only end-to-end, screen-reader, platform forced-colors/reduced-motion checks, Azure-dependent mock flows, lint triage, and footer Contact/Terms content. These remain listed in section 9; automated emulation is not a substitute for manual checks.
- **Browser-preference implementation (2026-10-22).** The installer now defaults to System, honors reported light/dark preferences, and falls back to dark when `matchMedia` is unavailable. It cycles System → Light → Dark → System; explicit modes persist. Focused accessibility browser coverage passes 11/11, including system changes, unavailable-preference fallback, forced-colors focus, and expanded 320px reflow. Real-browser 200% zoom and Windows High Contrast verification are still open.
- **Browser compatibility pass (2026-10-22).** The UI targets modern evergreen browsers supported by Vite 7, React 19, and MUI 7; legacy browsers such as Internet Explorer are out of scope. `CopyRow` falls back when Clipboard API access is missing or denied and announces failures; UUID generation falls back to secure `crypto.getRandomValues`; `ConfigErrorNotice` keeps its surface and border without `color-mix()`. Vitest's test globs were corrected so `pnpm test` discovers the existing suite. Focused UUID tests pass (12/12), and the isolated clipboard fallback browser test passes. Full unit tests have 252 passing and 3 existing Access Pass telemetry failures; the complete shared-building-block browser test retains an editor-border assertion mismatch. End-to-end and Vitest browser automation currently use Chromium only; Firefox and Safari/WebKit have not been verified.

### Follow-up status (2026-10-24)

- **Card header interaction and descriptions.** The full card header is a pointer toggle; the title and chevron remain separate keyboard-operable controls, and expanded-card actions stop event propagation. Where provided, card introductions and pipeline-stage descriptions are shown in locked cards before their unmet-requirement lists.
- **Theme and accessibility refinements.** Card header hover backgrounds use shared status-border tinting. Forced-colors mode gives `:focus-visible` a system `Highlight` outline and removes the box-shadow focus halo. `ConfigErrorNotice` now has theme-based background and border fallbacks, enhanced with `color-mix()` where supported.

## 8. Design decisions (mirrored in `README.md`)

Per the repository `README.md` rules, decisions live in the folder where they apply. This folder's [README.md](README.md) records:

1. MUI theme is the single source of truth for colour, type and shape; `sx` is for layout and dynamic values only.
2. `App.css` holds global, non-component rules only.
3. Only `sans-serif` and `monospace` are used: `sans-serif` for main UI content and `monospace` for technical values. No other font overrides or web-font downloads.
4. Text sizes range from 0.75rem to 1rem and target contrast >= 4.5:1, except intentionally muted card titles, which may be below 4.5:1.
5. Interactive elements are native or MUI-semantic (button, link, input). The card header wrapper is an intentional pointer-toggle exception; title and chevron controls remain keyboard-operable.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.
7. The card header toggles on click, with separate labelled, keyboard-operable title and chevron controls; expanded-card actions do not bubble into the toggle. Disable click ripples and retain a visible keyboard-focus outline.
8. Card toggle names include visible title/summary text followed by visually hidden status; expanded content is a region labelled by its heading.
9. The installer shell has a skip link, one page-level `h1`, semantic main and footer landmarks, a deployment-progress section named with `aria-label` and headed by `h2`, and an `h2` for help/information. There is no separate "Deployment steps" heading; the main and footer landmarks themselves are not explicitly named.
10. New-tab links expose that behavior in their accessible name and remain underlined for inline distinction.
11. Axe runs its default rules; only explicitly marked non-interactive muted-title spans are excluded from analysis for the accepted contrast exception.
12. Recommended jsx-a11y rules and scoped `sx` style restrictions are enforced by ESLint.

These may later be elevated to the repository level if the other UI folders (`portal/ui`, `accessPass/ui`) adopt them.

## 9. Remaining work (excluding Step 11)

- [ ] Complete the Step 10 manual reflow check at 200% browser zoom and 320 CSS px. Inspect all card content and controls for clipping, unwanted page-level horizontal scrolling, and wrapping; distinguish the terminal's intentional internal scrolling. Automated 320px expanded-card/form bounds pass; real browser zoom remains unverified.
- [ ] Complete one representative deployment flow using only the keyboard, including the skip link, card expansion and prerequisite navigation, form controls, links, and dialogs.
- [ ] Verify live progress, success, and error announcements with a supported screen reader during real state changes; record the OS, browser, assistive technology, flow, and results.
- [x] Fix `ConfigErrorNotice`'s light-only white surface so its error text and border have sufficient contrast in both color schemes; verify the rendered contrast in dark and light modes. Done 2026-10-22: surface and border mix from `background.paper`, dark text uses `error.light`. Computed contrast: light text 5.7:1, border 3.2:1; dark text 7.9:1, border 3.6:1. Not checked in a browser.
- [ ] Expose each `StepRow` state in text for assistive technology, and give running progress indicators accessible names; verify with a screen reader or accessibility inspection.
- [ ] Make variable-description and changed-since-plan explanations available to keyboard and screen-reader users, not only on hover.
- [ ] Reassess disabled-button visibility in both color schemes and update the UX inventory to match the current theme styles and the axe test's actual muted-title-only exclusion.
- [x] Rerun the focused accessibility Playwright spec after providing its required Azure and GitHub client ID environment values. Passed 11/11 on 2026-10-22; the earlier attempt failed before test initialization.
- [ ] Verify Windows forced-colors/high-contrast and reduced-motion behavior manually. Automated forced-colors focus/boundary and reduced-motion emulation pass, but do not replace the platform check.
- [ ] Add or run a representative browser smoke/accessibility matrix for Firefox and Safari/WebKit; current automated browser projects use Chromium only.
- [ ] Investigate Vite's browser bundle warnings for Node modules imported through `dotenv` in `corp-src/api/backend.ts` and `corp-src/api/github.ts`. Replace this with a browser-safe `.env` parser or document why the current bundle is safe in supported browsers.
- [ ] Rerun the Azure-dependent mock flows when their required authentication and setup state is available. Investigate failures that previously stopped before reaching their target cards, and review desktop/mobile screenshot differences before updating any baselines.
- [ ] Triage current test and lint results. After fixing test discovery, the latest full unit run had 252 passed and 3 Access Pass telemetry failures (`appInsights` is null); the full shared-building-block browser suite has an editor-border assertion mismatch, while the isolated clipboard fallback test passes. The earlier 2026-10-22 full test run passed before test discovery was repaired. The last recorded full lint run had 33 errors and 5 warnings; keep unrelated findings distinct from regressions.
- [ ] Decide whether `MONO_FONT`, `labelSx`, and `refreshBtnSx` are supported shared helpers or transitional shims to remove; document the decision or migrate their live consumers. Retain `borderHoverTint` if it remains the shared hover behavior.
- [ ] Decide whether the footer's Contact and Terms placeholders are acceptable for this release; otherwise provide real content or remove those entry points.
