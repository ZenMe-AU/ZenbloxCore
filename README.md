


## Design decisions

1. Design decisions are tracked as part of readme.md files within folders.
2. Each design decision is recorded at the highest level where it makes sense, e.g. as few as possible decisions should be recorded at the top level.
3. Sometimes a design decision is document generically at a high level, and more specific at a lower level.
4. AI agents are encouraged to record design decisions during each session in the folders where they are working, this allow the design decisions to be recorded quickly and later elevated during higher level sessions.
5. Code files should have the higher level functions at the top and the lower level support functions towards the bottom.
6. When recording design decisions group them based on whether they relate to the final functional product, or if they relate to the SDLC delivery process. For example Product decisions, development team way of work decisions, test automation decisions, operational support and monitoring decisions, etc. You do not need to call out these headings, it should become clear from the content of the items grouped together as more decisions aggregate together. This may cause you to be considerate when adding new decisions to the list, and sometimes the list need to be re-grouped once it becomes too disorganised.
7. Preferably maintain shared configuration in the monorepo root rather than in individual workspaces, workspaces may override where needed:  `tsconfig.json`, `eslint.config.js`, `knip.json`, `playwright.config.ts`, `vitest.config.ts`.
8. **Workspace launch configuration.** Keep app-specific VS Code launch configurations and supporting tasks in the app’s own `.vscode` directory (`launch.json` and `tasks.json`), not in a parent folder. List each independently runnable app as an explicit folder in the repository-root `.code-workspace` file, even if it is nested under another listed folder, so VS Code discovers its local configuration. Register pnpm packages separately in the root `pnpm-workspace.yaml`; package registration does not control VS Code launcher discovery.


