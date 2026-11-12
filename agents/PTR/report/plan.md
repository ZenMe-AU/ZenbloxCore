# PTR Report Dashboard — Build Plan

Static dashboard for browsing Playwright Test Review (PTR) findings stored in
[../reviewManifest.jsonl](../reviewManifest.jsonl). Outlook-style master/detail layout.

## 1. Deliverables

```
agents/PTR/report/
  plan.md             this file
  index.html          static shell: layout, inline <style>, inline <script>. Never regenerated.
  generateReport.ts   reads ../reviewManifest.jsonl -> writes report.html -> hosts folder in browser
  report.html         GENERATED. Plain, unstyled semantic HTML. Overwritten on each run. Committed to git.
  assets/
    logo.svg          header brand mark
    icon-component.svg
    icon-integration.svg
    icon-mock.svg
    icon-coverage.svg
    icon-empty.svg    "no findings" / "no suite" placeholder
    bg-pattern.svg    subtle detail-pane background
```

Run: `npx tsx agents/PTR/report/generateReport.ts` (no dependencies beyond Node built-ins).
Optional args: `--in <manifest>` `--out <report.html>`; defaults resolve relative to the script.

### 1.1 Hosting step (last step of generateReport.ts)

After `report.html` is written, the script prints and runs one hardcoded command, from the repo root:

```ts
// Copy-paste friendly: run from repo root.
const HOST_CMD = 'npx --yes http-server agents/PTR/report -p 8765 -c-1 -o /index.html';
```

- `spawn(HOST_CMD, { shell: true, stdio: 'inherit', cwd: <repo root> })`; repo root resolved as
  `../../..` from the script directory.
- `-c-1` disables caching so a refresh always picks up the new `report.html`; `-o` opens the browser.
- Script logs `Hosting: <HOST_CMD>` before spawning, then stays attached until Ctrl+C.
- `--no-host` flag skips this step (for CI or regenerating while a server is already running).

### 1.2 Git

All files in `agents/PTR/report/` including `report.html` are committed. Nothing is git-ignored, so the
repo always holds the latest report. Generator output must be deterministic (stable sort, no
random IDs; `data-generated` is the only volatile value) to keep diffs small.

## 2. Source data (one JSON object per line)

```jsonc
{
  "component":       { "path": "zeninstallerPvt/ui/corp-src/cards/X/XCard.tsx", "gitHash": "...", "reviewTimestamp": "ISO" },
  "integrationTest": { "path": "...spec.mts" | null, "gitHash": "..." | null, "findings": ["HIGH: ...", "..."] },
  "mockTest":        { "path": "...spec.mts" | null, "gitHash": "..." | null, "findings": [] },
  "reviewMethod":    "Static source review; no live tests executed.",
  "coverage"?: {                       // optional
    "evidence": [{ "path", "capturedAt", "entries", "zeroCountRanges" }],
    "comparison": "string",
    "limitations": "string",
    "recommendations": ["string"]
  }
}
```

Parsing rules:
- Skip blank lines. On invalid JSON, log `line N: <error>` to stderr and continue; exit code 1 if any line failed.
- Finding severity = leading prefix matched by `/^(CRITICAL|HIGH|MEDIUM|LOW|INFO|Coverage gap):\s*/i`.
  Prefix is stripped from the text and emitted as `data-severity` (`critical|high|medium|low|info|gap`).
  No prefix -> `info`.
- `path: null` on a test block means "no suite exists"; its findings still render.
- Component display name = file name without extension; group = parent folder under `corp-src/`
  (e.g. `cards`). Sort components by highest severity, then name.

## 3. report.html contract (generated, no styling)

All text is HTML-escaped (`& < > " '`) by the generator. No inline styles, scripts or classes
beyond the `data-*` hooks below. Must be readable on its own if opened directly.

```html
<section id="ptr-report" data-generated="2026-10-24T10:00:00Z" data-source="reviewManifest.jsonl" data-count="16">
  <article data-component="zeninstallerPvt/ui/corp-src/cards/GithubLogin/GithubLoginCard.tsx"
           data-name="GithubLoginCard" data-group="cards"
           data-git-hash="33bb3d4b..." data-reviewed="2026-10-12T06:21:32.306Z"
           data-max-severity="high" data-high="1" data-medium="1" data-low="0" data-gap="0" data-info="0">
    <h2>GithubLoginCard</h2>
    <dl data-role="meta">
      <dt>Path</dt><dd>zeninstallerPvt/ui/corp-src/cards/GithubLogin/GithubLoginCard.tsx</dd>
      <dt>Git hash</dt><dd>33bb3d4b...</dd>
      <dt>Reviewed</dt><dd>2026-10-12T06:21:32.306Z</dd>
      <dt>Method</dt><dd>Static source review; no live tests executed.</dd>
    </dl>

    <section data-suite="integration" data-path="...GithubLoginCard.spec.mts" data-git-hash="704ce686...">
      <h3>Integration tests</h3>
      <ul>
        <li data-severity="medium">The valid-PAT integration case dereferences ...</li>
      </ul>
    </section>

    <section data-suite="mock" data-path="...GithubLoginCard.spec.mts" data-git-hash="6d237290...">
      <h3>Mock tests</h3>
      <ul>
        <li data-severity="high">Rejected-PAT route compares the Authorization header ...</li>
      </ul>
    </section>

    <!-- only when coverage present -->
    <section data-role="coverage">
      <h3>Coverage</h3>
      <p data-field="comparison">...</p>
      <p data-field="limitations">...</p>
      <ul data-field="recommendations"><li>...</li></ul>
      <table data-field="evidence">
        <tr><th>Path</th><th>Captured</th><th>Entries</th><th>Zero-count ranges</th></tr>
        <tr><td>...</td><td>...</td><td>1</td><td>28</td></tr>
      </table>
    </section>
  </article>
  ...
</section>
```

A suite with `path: null` emits `data-path=""`. A suite with zero findings emits an empty `<ul>`.

## 4. index.html behaviour

Load sequence:
1. `fetch('report.html', { cache: 'no-store' })` -> `DOMParser` -> query `#ptr-report > article`.
2. Build an in-memory model from `data-*` attributes and text nodes (never inject raw report
   markup into the visible DOM; create elements and set `textContent`).
3. Render nav + select component from `location.hash` (`#c=<encoded path>`), else first item.
4. On fetch failure show an error panel: "report.html not found — run generateReport.ts" and, if
   `location.protocol === 'file:'`, explain that browsers block `fetch` on `file://` and to serve the
   folder (e.g. `npx serve agents/PTR/report` or VS Code Live Preview).

Interactivity:
- Click / Enter on nav item selects it; Up/Down arrow keys move selection when nav is focused.
- Search box filters nav by name or path (case-insensitive).
- Severity filter chips (High / Medium / Low / Gap / Info) filter both nav (components that have
  any matching finding) and the cards shown in the detail pane. State kept in memory only.
- Toggle "Hide components with no findings".
- Coverage card is expanded by default; its header toggles collapse (`<details open>`).
- Click on a path or hash in a card footer copies it to clipboard; brief "Copied" toast.
- Selection updates `location.hash`; refresh restores selection.

## 5. Mock UI

### 5.1 Overall layout (desktop, >= 1000px)

```
+----------------------------------------------------------------------------------------------+
| [logo] PTR Review Dashboard                   16 components | 9 HIGH  14 MED  3 GAP          |
|                                               Generated 2026-10-24 10:00 from reviewManifest |
+--------------------------------+-------------------------------------------------------------+
| [ Search components...      ]  |  HEADER                                                     |
| (HIGH)(MED)(LOW)(GAP)(INFO)    |  [icon] GithubLoginCard                         [!] 1 HIGH  |
| [ ] Hide clean components      |         zeninstallerPvt/ui/corp-src/cards/GithubLogin/...   |
|--------------------------------|  -----------------------------------------------------------|
| CARDS                          |  Git hash   33bb3d4  (copy)      Reviewed  12 Oct 2026 06:21|
| > GithubLoginCard     [H1][M1] |  Method     Static source review; no live tests executed.   |
|   AzureAppRegistration [H2][M1]|  Integration  GithubLoginCard.spec.mts @ 704ce68            |
|   AzureSubscription    [H1][M1]|  Mock         GithubLoginCard.spec.mts @ 6d23729            |
|   CreateDomainCard     [M1][G1]|                                                             |
|   AzureLoginCard          [G1] |-------------------------------------------------------------|
|   CoreInfraCard           [M1] |  CONTENT                                                    |
|   RepoDetail              [M1] |                                                             |
|   AccessPassCard   (no suites) |  INTEGRATION TESTS (1)                                      |
|   ...                          |  +-------------------------------------------------------+  |
|   BackendDeployCard        [ok]|  || The valid-PAT integration case dereferences          |  |
|                                |  || process.env.GITHUB_TOKEN with a non-null assertion   |  |
|                                |  || and has no preflight/skip, so missing credentials    |  |
|                                |  || fail opaquely.                                       |  |
|                                |  |------------------------------------------------------|  |
|                                |  | [MEDIUM]  Integration  GithubLoginCard.spec.mts      |  |
|                                |  |           @704ce68                                   |  |
|                                |  +-------------------------------------------------------+  |
|                                |                                                             |
|                                |  MOCK TESTS (1)                                             |
|                                |  +-------------------------------------------------------+  |
|                                |  || Rejected-PAT route compares the Authorization header |  |
|                                |  || with a literal malformed template string ...         |  |
|                                |  |------------------------------------------------------|  |
|                                |  | [HIGH]    Mock  GithubLoginCard.spec.mts  @6d23729   |  |
|                                |  +-------------------------------------------------------+  |
|                                |                                                             |
|                                |  COVERAGE                                                   |
|                                |  +-------------------------------------------------------+  |
|                                |  | (see 5.3 - expanded by default, full width)           |  |
|                                |  +-------------------------------------------------------+  |
+--------------------------------+-------------------------------------------------------------+
```

- Left pane: fixed 300px, own scroll. Right pane: flex, own scroll; header is sticky.
- `||` = 4px left accent bar coloured by severity.
- Nav item: name (bold), path tail (muted, ellipsis), severity count pills right-aligned.
  Selected item: accent background + left bar. Clean component shows a green `ok` pill.

### 5.2 Finding card

```
+------------------------------------------------------------+
|| <finding text, full, wraps, 15px>                          |
||                                                            |
|------------------------------------------------------------|
| [SEVERITY]  [icon] Integration|Mock   <spec file name>      |
|             @<short hash>   reviewed <date>                 |
+------------------------------------------------------------+
```

Footer fields (12px, muted): severity pill, suite type with icon, spec file name (title = full
path, click copies), short git hash (click copies full), component review date.
Cards laid out in a responsive grid: `repeat(auto-fill, minmax(360px, 1fr))`.

### 5.3 Coverage card

Third content group, after Mock tests. Single full-width card (`grid-column: 1 / -1`), rendered as
`<details open>` so it is expanded by default; clicking the summary row collapses it.

```
COVERAGE
+---------------------------------------------------------------------------+
| v [icon-coverage] Coverage                       8 captures | max 29 zero  |  <- <summary>
|---------------------------------------------------------------------------|
| Comparison   Previous record contains no numerical coverage baseline; ... |
| Limitations  Existing raw V8 captures may include failed tests and ...    |
|                                                                           |
| Recommendations                                                           |
|  * Cover prerequisites, storage-name validation/availability, ...         |
|  * Verify VITE_AZURE_CLIENT_ID and SITE_STORAGE_ACCOUNT autosave ...      |
|                                                                           |
| Evidence                                                                  |
|  Capture                                    Captured          Entr  Zero  |
|  ...AzureA-07489-on-has-no-subscription...  08 Oct 00:13:43    1     28   |
|  ...AzureA-195fe-n-details-fail-to-auto...  08 Oct 00:14:01    1     29   |
|---------------------------------------------------------------------------|
| [icon-coverage] Coverage   8 evidence files   reviewed 08 Oct 2026         |
+---------------------------------------------------------------------------+
```

- Evidence path shows the test-results folder name (middle-ellipsis); title = full path, click copies.
- Evidence table scrolls horizontally inside the card on narrow widths.
- Component without `coverage`: card shows `[icon-empty] No coverage data recorded` (still expanded).
- Severity filters do not hide the coverage card.

### 5.4 Empty / missing states

```
INTEGRATION TESTS
+-----------------------------------------------------------+
| [icon-empty]  No integration suite found for this component|   <- path null, no findings
+-----------------------------------------------------------+

MOCK TESTS
+-----------------------------------------------------------+
| [icon-empty]  No findings - suite reviewed clean           |   <- path set, findings []
+-----------------------------------------------------------+
```

When `path` is null but findings exist (current manifest pattern), render the findings as cards
with footer suite file shown as `no suite`, plus a small banner above them: "No suite exists".

### 5.5 Narrow screens (< 800px)

Nav collapses to a top drop-down `<select>`; detail pane takes full width.

## 6. Visual style

- System font stack; neutral light theme; CSS custom properties in `:root` for all colours.
- Severity palette: critical `#7a0019`, high `#c62828`, medium `#ef6c00`, low `#f9a825`,
  gap `#6a1b9a`, info `#546e7a`, ok `#2e7d32`.
- Cards: white, 8px radius, 1px border `#e0e0e0`, subtle shadow on hover.
- `prefers-color-scheme: dark` overrides the custom properties only.
- Assets referenced via relative `assets/...` paths; SVGs use `currentColor` where possible.

## 7. Security

- Generator escapes all manifest strings; index.html only uses `textContent` / attribute setters
  when rendering, so manifest content cannot inject script.
- No external network requests, CDNs, or fonts.

## 8. Implementation steps

1. Create `assets/` SVGs (simple, monochrome, `currentColor`).
2. Write `generateReport.ts`: read file, parse lines, classify severity, sort, build HTML string
   with an `esc()` helper, write `report.html`, print summary (`N components, M findings`),
   then run `HOST_CMD` (section 1.1) unless `--no-host`.
3. Run the generator with `--no-host`; open `report.html` directly to sanity-check.
4. Write `index.html` (layout + CSS + JS per sections 4-6).
5. Run the generator normally and verify in the opened browser: selection, hash restore, search,
   severity filters, coverage card expanded by default, empty states, copy-to-clipboard, narrow
   layout, dark mode, and the `file://` error message.
6. Commit all of `agents/PTR/report/` including `report.html`.

## 9. Open questions

- "executed with ctx" interpreted as run via `tsx`. Confirm if a different runner/context object is intended.
