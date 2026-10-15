# CSS in the corp installer: overview and standardisation plan

Scope: `zeninstallerPvt/ui` only. Paths below are relative to that folder (the old `web/` prefix no longer exists).

Sections 0–6 record the initial audit baseline from 2026-10-07; their counts and source-tree observations are historical, not a current inventory. Progress notes in section 7 supersede baseline findings where work has since been completed. Latest update: 2026-10-15.

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

1. **One theme** (`corp-src/theme.ts`), enabled with `cssVariables: true`, provided once in `corp.tsx` with `CssBaseline`. It owns:
   - **Palette**: slate/blue/orange/green/red tokens with accessible ordinary text shades (`text.primary`, `text.secondary`, `text.muted` >= 4.5:1) and semantic `success|warning|error|info` card status colors. Accepted exception: muted card text and semantic status summaries may be below 4.5:1; do not use those colors for ordinary instructional or control text.
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
- `ViewLink` opens links with `window.open(href, "_blank", "noopener,noreferrer")`.
- I found no Content-Security-Policy in `index.html`, `vite.config.ts` or `public/`. I did not check `deploy/`.

### Real exposure: CSP and runtime style injection

- Emotion injects `<style>` tags at runtime. A CSP that blocks inline styles would therefore need `style-src 'unsafe-inline'`, or a per-request nonce. A static host cannot provide a per-request nonce.
- With a nonce, pass it through `<CacheProvider>` configured with the `nonce` option.

### Lower-level risks (none present today)

- Never interpolate untrusted values (tenant names, repo names, API responses) into a style string, a `url()` or a CSS selector.
- The `href` values come from `getXxxUrl()` helpers built from API data. Keep validating them as `https:` URLs, since `window.open("javascript:…")` is a risk if a helper ever passes an unvalidated value through.

### How standardisation helps

Standardisation helps modestly, mostly by making a strict CSP possible:

- **Strict CSP.** Static CSS in a shared stylesheet allows `style-src 'self'`. Dropping `'unsafe-inline'` also requires the remaining MUI and Emotion runtime styles to be handled by a nonce or by build-time extraction.
- **Smaller attack surface.** A theme plus a fixed set of shared components replaces 764 inline style objects, so review is simpler.
- **Auditability.** The `data-sensitive` attributes can be handled by one rule such as `[data-sensitive]` blur, for screenshots and recordings.

Standardisation alone does not fix anything. MUI still injects some runtime styles, so a CSP needs the nonce or the `unsafe-inline` allowance until Emotion is replaced or extracted.

### Related hardening to consider

- Add `frame-ancestors 'none'` (or `X-Frame-Options: DENY`). The app handles Azure and GitHub tokens, so clickjacking is a bigger risk than styles.
- Add a full CSP (`default-src 'self'`, with explicit `connect-src` for the Microsoft, Azure and GitHub endpoints) plus `Referrer-Policy` and `X-Content-Type-Options`. These are usually set as host headers, since a `<meta>` CSP cannot set `frame-ancestors`.
- Self-host the fonts (see section 1, issue 5), so the CSP does not need `fonts.googleapis.com`/`fonts.gstatic.com`.

## 5. Accessibility recommendations

The counts below are the initial 2026-10-07 baseline from `cards/`, `components/` and `App.tsx`; `Card.tsx`, `ViewLink.tsx`, `Header.tsx`, `AzureLoginCard.tsx` and `App.tsx` were reviewed in detail.

Measured baseline signals: 95 `onClick` handlers (the card header and requirement rows in `Card.tsx` were `Box`es with `onClick`), 8 `aria-*` attributes, 3 `tabIndex`, 4 `onKeyDown`, 0 `role=`, 0 headings, 0 landmarks, and 0 `<img>`. There was no `:focus-visible` rule or `prefers-reduced-motion` handling. No `eslint-plugin-jsx-a11y` or axe tooling was installed. Of 24 form controls, only 36 `label=`/`aria-label`/`inputProps` hits existed across the whole set, and field labels were mostly a `Typography` placed beside the control.

| # | Priority | Issue | Fix |
|---|---|---|---|
| 1 | High | **Card header wasn't keyboard accessible (resolved for the shared card shell).** | The title and chevron are now separate semantic toggle buttons with `aria-expanded`/`aria-controls`; the chevron has an accessible label. The region is labelled by the card heading. Audit remaining non-semantic click targets separately. |
| 2 | High | **Card toggles lacked visible keyboard focus and showed an unwanted click ripple (resolved for the shared card shell).** | Card title and chevron toggles disable MUI ripples and render an explicit focus outline. `App.css` also provides a global `:focus-visible` outline for other controls. |
| 3 | High | **Card status was conveyed by icon and colour only (resolved for the shared card shell).** | Status glyphs are hidden from assistive technology; the title toggle's accessible name includes the status, with "Locked" taking precedence. Live regions for dynamic progress, success and error messages such as `loginError` remain open. |
| 4 | High | **Colour contrast.** `#94a3b8` (about 2.6:1 on white) is the most-used text colour. `#cbd5e1` is lower. The orange `#ea580c` and green `#16a34a` status summaries are below 4.5:1 on white. | Accepted exception: intentionally muted card text and semantic status summaries may be below 4.5:1. Do not use these colors for ordinary instructional or control text; retain the 4.5:1 target for ordinary text. |
| 5 | Medium | **Small text.** Sizes are 0.68–0.8rem (about 11–13px). Truncated titles and summaries use ellipsis. | Keep text within 0.75–1rem. Keep `rem` units so browser zoom works. Add a `title` or tooltip for truncated text and expose the full text to screen readers. |
| 6 | Medium | **Reduced-motion handling was missing (resolved globally).** | `App.css` reduces CSS animation and transition durations, including card transitions, when `prefers-reduced-motion: reduce` is active. |
| 7 | Medium | **`ViewLink` is a `Button` calling `window.open`**, and its text is hidden below the `sm` breakpoint. | Use `<a href target="_blank" rel="noopener noreferrer">` so it can be opened in a new tab by keyboard or context menu. Keep the `aria-label` on narrow screens and add "(opens in new tab)". |
| 8 | Medium | **Labels aren't tied to controls.** `labelSx` is applied to a `Typography` beside the `Select`/`TextField`. | Use `InputLabel`/the `label` prop, or `aria-labelledby`. |
| 9 | Low | **Page structure.** Card titles are now `h3` headings; `Header` still renders `document.title` as a `Typography`, and the page still has no `<main>`. | Add `<header>`, `<main>`, a skip link, one `h1` (page title), `h2` for group labels (`groupLabelSx`), and consider `<section aria-labelledby>` for cards. |
| 10 | Low | **Forced colours / high contrast.** | Test with `forced-colors: active` and keep borders on cards and buttons so they stay visible. |
| 11 | Medium | **Plain-text instructions are `<br />`-separated.** The intro in `App.tsx` is one `Typography` with numbered items typed as text and an unlinked URL. | Use a real `<ol>`, make the GoDaddy URL a link (`ExternalLink`), and keep the intro at body size. |
| 12 | Medium | **Dynamic status and errors are silent.** Progress spinners (`CircularProgress`), step results and errors have no live region. | `role="status"` for progress and success, `role="alert"` for errors, via the shared `StatusText`/`ErrorText`. Give spinners an accessible name. |
| 13 | Medium | **`data-sensitive` content can be masked for screenshots/recordings (implemented as opt-in).** | Set `data-mask-sensitive="true"` on the document root to blur `[data-sensitive]` content; the default UI remains unchanged. |

## 6. Other considerations

- **Fonts.** Follow the recommendation above: `sans-serif` is the UI face and `monospace` is for technical values only. Remove unloaded IBM Plex references and other font overrides instead of adding font downloads.
- **Theming and dark mode.** `createTheme({ cssVariables: true })` exposes tokens as CSS variables and makes a later dark scheme a palette addition rather than a rewrite.
- **MUI and CSS ordering.** With the theme-first approach there are no competing component classes. If a global rule must override MUI, use CSS `@layer` with `StyledEngineProvider enableCssLayer`.
- **Responsive card layout (2026-10-09).** Card groups use an auto-fitting grid with a 360px minimum column width: columns grow to fill available space, then naturally reduce from three to two to one as the viewport narrows. Expanded cards span the group width. The page remains capped at 1280px for readability.
- **Test selectors.** Keep the `data-id` and `data-sensitive` attributes and the `card-<id>` ids, since tests and the Playwright suites depend on them.
- **Bundle and performance.** Moving static styles out of runtime Emotion reduces JS work and style recomputation. Check the bundle size before and after.
- **Linting and CI.** Add `eslint-plugin-jsx-a11y`, `@axe-core/playwright` in `pwtests/`, and a lint rule or check against raw hex colours in TSX, to stop the inline duplication coming back. Consider Stylelint for the shared CSS.
- **Documentation.** Document the tokens and class names in the stylesheet header, or here, once they exist.

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
- **Accepted design exception (2026-10-14).** Muted card text (`#94a3b8`) and semantic status summaries (including `#ea580c` and `#16a34a`) may remain below the ordinary-text contrast target of 4.5:1; reserve them for those muted/status roles, not instructional or control text. This scoped exception is intentional and does not claim WCAG contrast conformance for the affected text.
- **Verification (2026-10-14):** focused browser checks for global CSS rules, keyboard title/chevron toggles, no ripples, title tooltip, wrapping summaries and locked prerequisite navigation passed at desktop and mobile (6/6). The complete Azure Login mock spec passed 10/10 with existing snapshots unchanged. `pnpm build` passed. Focused ESLint passed for `corp.tsx`, `cardLayout.ts`, `theme.ts` and `Card.tsx`; linting `App.tsx` also reports `react-refresh/only-export-components` at its wrapped default export.
- **Full-suite check (2026-10-14):** `pnpm test` reported 250 passed and 2 failed; both failures are Access Pass telemetry expectations in `useAccessPassCard.test.tsx`. `pnpm lint` remains red with 37 errors and 5 warnings across the UI, including `App.tsx` and unrelated component findings. The Playwright `.mts` spec also has language-service import-extension diagnostics, but the Playwright runner executes it successfully.

### Step 5. Page shell

- `App.tsx`: `<header>`, `<main>`, skip link, one `h1`, a single labelled `h2` section for the flat card grid, and an intro with a real list and link. Move page-root colors into the theme/`CssBaseline`.
- `Header.tsx`: use the theme for the mark and title; keep `document.title` as the canonical title and render it as the page `h1`.
- `ViewLink.tsx`: retain the secure anchor behavior (`target="_blank" rel="noopener noreferrer"`) and add "(opens in new tab)" to the accessible name while keeping the visible label.
- **Implemented (2026-10-14; footer added 2026-10-15).** Added a focus-revealed skip link, semantic header/main landmarks, page `h1`, labelled “Deployment steps” section, ordered prerequisites and GoDaddy link. The page uses the theme background/text tokens and preserves the prior `#f8fafc` background. Shared View links announce their new-tab behavior. Existing card order, IDs, data hooks, and card heading structure are preserved. A semantic footer now groups help and information links and includes a keyboard-shortcuts dialog whose contents remain a placeholder until shortcuts are available.
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

### Step 8. Migrate the remaining cards, one PR each

Order by size and reuse: `GithubLoginCard`, `AwsLoginCard`, `AzureSubscriptionCard`, `AzureAppRegistrationCard`, `CoreInfraCard`, `CreateDomainCard`, `RemoteTerminalInfraCard`, `BackendDeployCard`, `WebDeployCard`, `AwsSetupCard`, `StageCard`/`StagePlanDetail`/`RemoteTerminal`, `RepoCard` + `RepoDetail`/`EnvDetail`/`EnvBranchDetail`, `GlobalGroupsCard`, `AccessPassCard`, and the shared `StepRow`, `CopyRow`, `VariablesCard`, `SecretsCard`, `RestoreToast`, `CloudVariableDetail`, `EnvSecretsDetail`. Per card: use theme variants and building blocks, keep `sx` for layout only, add labels to every control, add live regions for status/errors, and keep text sizes between 0.75rem and 1rem.

### Step 9. Guardrails

- Add `eslint-plugin-jsx-a11y` to `eslint.config.js`.
- Add `@axe-core/playwright` scans of the main page (collapsed, one card expanded, one locked) to the mock tests.
- Add a lint rule (`no-restricted-syntax`) forbidding hex literals, `fontFamily` and `fontSize` in `sx` under `corp-src/cards` and `components`.
- Add a Playwright check that Tab reaches every card header and expands it with Enter/Space.

### Step 10. UX validation

- Check 200% zoom and 320px width (no clipped or horizontally scrolling text, wrapped not truncated), keyboard-only completion of one full flow, screen-reader announcements of status/errors, `forced-colors: active`, and reduced motion. Tune the scale from what is observed rather than adding new sizes.

### Step 11. Hardening (optional, after the above)

- Decide the CSP approach (nonce through an Emotion `CacheProvider`, or `unsafe-inline` for styles), add `frame-ancestors 'none'`, `Referrer-Policy` and `X-Content-Type-Options` as host headers in `deploy/`, and check the `href` helpers only emit `https:` URLs.

## 8. Design decisions (mirrored in `README.md`) C:\Dev\ZenbloxCore\README.md

Per the repository `README.md` rules, decisions live in the folder where they apply. This folder's `README.md` C:\Dev\ZenbloxCore\zeninstallerPvt\ui\README.md records:

1. MUI theme is the single source of truth for colour, type and shape; `sx` is for layout and dynamic values only.
2. `App.css` holds global, non-component rules only.
3. Only `sans-serif` and `monospace` are used: `sans-serif` for main UI content and `monospace` for technical values. No other font overrides or web-font downloads.
4. Text sizes range from 0.75rem to 1rem and target contrast >= 4.5:1, except muted card text and semantic status summaries, which may be below 4.5:1.
5. Interactive elements are native or MUI-semantic (button, link, input), never `onClick` on a `Box`.
6. Test hooks (`id="card-<id>"`, `data-id`, `data-sensitive`, accessible names) are part of the UI contract.

These may later be elevated to the repository level if the other UI folders (`portal/ui`, `accessPass/ui`) adopt them.
