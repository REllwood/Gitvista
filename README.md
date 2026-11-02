# GitVista

**Visual Git for everyone.** A beginner-friendly, GitKraken-style desktop Git client (Electron + React) whose defining feature is a **live "ghost" preview of what every action will do to your history *before* you confirm it**, paired with plain-language explanations and the real `git` command shown underneath.

> If you are an AI agent or a new contributor picking this project up cold: read this whole file. It is the source of truth for the tool's purpose, architecture, conventions, what's built, what isn't, and how to continue. There is an explicit **"Continuing development"** prompt at the bottom.

---

## 1. What this is and who it's for

GitVista helps people who don't know Git (or are nervous with it) use it confidently, while still being useful to power users. Two audiences:

- **Beginners** — every action uses plain English ("Save a snapshot" instead of just "commit"), every Git term is a hover-tooltip that opens a glossary, and a one-click **learning sandbox** generates a safe demo repo to experiment in.
- **Everyone** — a real visual commit graph, staging, branching, merging, rebasing, conflict resolution, cloning, PRs, multiple repos in tabs.

**The wedge (do not lose this):** GitKraken does not show you what an action will do before you do it. GitVista does. Every non-trivial action renders a small graph with dashed "ghost" nodes showing the result, plus a plain-language note. Keep extending this into scarier operations — it's the main reason to switch.

---

## 2. Quick start

**Prerequisites:** Node 22.12+, npm 10+, and **`git` installed and on PATH** (the app shells out to the system git).

```bash
npm install
npm run dev        # Vite dev server (127.0.0.1:5173) + Electron, with hot reload
```

Other scripts:

```bash
npm start          # build the renderer, then run Electron against the built files (production-like)
npm run build      # build the renderer only (Vite → dist/) — fast way to catch JSX/import errors
npm run dist:dir   # package an unpacked .app/.exe into release/ (fast; no installer)
npm run dist       # full installers (DMG+zip / NSIS / AppImage+deb) into release/
npm run release    # build + publish installers to a GitHub Release (CI, on tag)
npm test           # unit + real temporary-repository integration tests
npm run check      # tests + Electron syntax checks + production renderer build
```

**Learning sandbox** is generated at `~/Documents/GitVista Sandbox` on first use and reused safely on later launches.

**Packaging note:** `npm run dist` produces an **unsigned** build. It runs locally (on macOS, right-click → Open the first time). Real distribution needs code signing — see §8 (Deployment).

---

## 3. Feature status

### Implemented

| Area | What works | Lives in |
|---|---|---|
| Open / clone | Open a local repo, **clone from URL** (with folder picker), init a non-repo folder, one-click learning sandbox | `App.jsx`, `CloneModal.jsx`, `electron/git.cjs` (`clone`, `createSandbox`) |
| Commit graph | Custom lane-assignment layout, coloured branches, ref/tag/HEAD badges, keyboard selection, drag-and-drop actions and virtualised commit rows | `lib/graphLayout.js`, `GraphView.jsx`, `GraphSvg.jsx` |
| Who did what | Author/committer, date, files changed, signature status, GitHub/Gravatar profile images and initials fallback | `CommitDetails.jsx`, `Avatar.jsx`, `lib/avatar.js`, `lib/md5.js` |
| Staging & commit | Stage/unstage/stage-all, partial hunk staging, guarded discard, co-authors, commit preview, amend, signed commits and click-to-diff | `StagingPanel.jsx`, `DiffView.jsx`, `lib/commitMessage.js` |
| Branching | Create branch (with **plain-language name → slug**), switch, **rename**, delete, branch-from-any-commit, **check out a remote branch as local tracking** | `ActionModal.jsx`, `lib/slug.js`, `lib/actions.js` |
| Combine work | Merge, rebase, root-capable interactive rebase (reorder/squash/fixup/reword/drop), cherry-pick and revert, all with previews | `InteractiveRebaseModal.jsx`, `lib/preview.js`, `electron/git.cjs`, `electron/rebase-editor.cjs` |
| History edits | Reset (soft/mixed/hard), undo-last-commit, **amend**, tag, **move a branch label**, copy commit ID — right-click menu + **drag-and-drop on the graph** | `ContextMenu.jsx`, `GraphView.jsx`, `App.jsx` (`openCommitMenu`, `commitAction`, `onDropGesture`) |
| Undo / history | **One-click Undo** (operation-aware: switch→switch back, rebase→`ORIG_HEAD`, else→prior HEAD) + **reflog browser** to restore any point | `HistoryPanel.jsx`, `electron/git.cjs` (`getReflog`, `getUndoTarget`) |
| Conflicts | Detects interrupted merge/rebase/cherry-pick/revert; banner + guided panel (keep current/incoming/**mark-resolved after hand-edit**/abort/finish); **rebase ours/theirs corrected** | `ConflictPanel.jsx`, `electron/git.cjs` (`getConflictState`, `resolveUsing`, `markResolved`, `abortOperation`, `continueOperation`) |
| Remote | Fetch/prune, pull, upstream-aware push, warned `--force-with-lease`, remote/upstream management, and local/remote tag and branch operations | `PRModal.jsx`, `RemoteModal.jsx`, `Sidebar.jsx`, `electron/git.cjs` |
| GitHub | In-app open PR and issue lists, PR detail, CI status, reviews and merge/squash/rebase merge with head-SHA protection; browser-assisted PR creation | `GitHubPanel.jsx`, `electron/github.cjs` |
| Stash | Stash (**named, include-untracked**), unstash (pop), **apply (keep)**, **drop** | `Sidebar.jsx`, `electron/git.cjs` |
| Diff | Unified and side-by-side views, bounded word-level highlighting, per-hunk actions, binary/large-file notices, rename-aware history and arbitrary ref comparisons | `DiffView.jsx`, `DiffModal.jsx`, `CompareModal.jsx`, `lib/diff.js` |
| Search and inspection | Loaded-history filter, full-history and pickaxe search, file history and blame, and a reflog browser | `GraphView.jsx`, `FileInspectorPanel.jsx`, `HistoryPanel.jsx` |
| Multi-repo | Persisted tabs, recent repositories, fast repository/branch switching, resizable panels and linked worktrees | `TabBar.jsx`, `WelcomeScreen.jsx`, `WorktreeModal.jsx`, `App.jsx` |
| Power-user controls | Command palette, keyboard shortcuts, light/dark/system themes, repository-specific identities, pull strategy and OpenPGP/SSH/X.509 commit signing | `CommandPalette.jsx`, `SettingsModal.jsx`, `App.jsx` |
| Safety | Strict IPC schemas, trusted-sender checks, sandboxed renderer, navigation/permission policy, path containment, option-injection guards, OS keychain credentials, operation activity and render recovery | `ipc-validation.cjs`, `main.cjs`, `git.cjs`, `ErrorBoundary.jsx` |
| Teaching | Plain-language everywhere, hover glossary, action previews + notes + real git command | `Term.jsx`, `HelpPanel.jsx`, `lib/glossary.js` |
| Quality and packaging | Node test runner with real-repository integration tests, static security contracts, accessibility QA, electron-builder targets, release quality gate and auto-update states | `tests/`, `package.json`, `.github/workflows/release.yml` |

### Implemented with caveats

- **GitHub integration** uses a fine-grained personal access token stored by Git’s secure credential helper. PR creation still finishes in the browser; OAuth account switching, inline review comments and GitLab/Bitbucket/Azure providers are not implemented.
- **Interactive rebase** flattens merge commits (no `--rebase-merges`) and has no `edit`/`exec` actions; it needs a clean working tree (it warns up front).
- **Commit loading** is capped at the newest 800 commits. Rows are virtualised and full-history search is available, but graph previews near that boundary can be approximate.
- **Auto-update** is wired (`electron-updater`) and the publish feed is configured for GitHub Releases, but it only activates for **signed** builds from a real release.
- **Requires system `git`** on PATH (the app shells out to it); it is not bundled.
- **Platform coverage** is packaged for macOS, Windows and Linux; interactive QA has primarily been on macOS and browser-rendered states.

### Not implemented

OAuth and multiple provider accounts; GitLab, Bitbucket and Azure DevOps integration; inline PR diff comments and CI logs; a three-way visual merge editor; submodule and Git LFS management; commit templates; annotated/signed tag creation; multi-select history actions; `--rebase-merges`/`edit`/`exec`; grouped workspaces and GitKraken import; bundled Git; telemetry/crash reporting; and full Windows/Linux interaction QA.

---

## 4. Architecture

**Stack:** Electron (main + preload, CommonJS) · React 18 + Vite (renderer, JSX, **no TypeScript**) · [`simple-git`](https://github.com/steveukx/git-js) shelling out to the system `git`.

**Process model & the golden rule:** the renderer never touches git or Node directly. It calls `window.api.*` (exposed by `electron/preload.cjs` via `contextBridge`), which invokes IPC handlers in `electron/main.cjs`, which call `electron/git.cjs`. Every handler returns a uniform envelope:

```
{ ok: true, data }   |   { ok: false, error }
```

In the renderer, `App.jsx`'s `call(promise)` helper unwraps it (throws on `ok:false`), so feature code uses `try/catch`. Auth/network errors are humanized in `main.cjs` before they reach the UI.

**Dev vs prod loading:** in dev (`NODE_ENV=development`) the main process loads `http://127.0.0.1:5173`; in production it loads `dist/index.html` via `file://`. `vite.config.js` sets `base: './'` so built asset paths work over `file://`.

### File map

```
electron/
  main.cjs          Hardened window, trusted IPC handlers, operation progress, live repo watching and auto-update
  preload.cjs       contextBridge → window.api (the entire renderer-visible surface)
  ipc-validation.cjs Exact argument schema for every renderer-visible channel
  git.cjs           Every git operation via simple-git: reading (commits+parents+refs, status, branches,
                    remotes, tags, stashes, conflict state, reflog, undo target), mutations, hunk staging,
                    bounded diffs, history/blame, worktrees, clone, profiles/signing and secure credentials
  github.cjs        GitHub REST calls, credential retrieval, response shaping and URL/avatar validation
  rebase-editor.cjs Non-interactive editor for `git rebase -i` (todo + reword-message injection); copied
                    to a temp dir and spawned via GIT_SEQUENCE_EDITOR/GIT_EDITOR (asar-safe)
src/
  main.jsx       React entry (wraps <App/> in <ErrorBoundary/>)
  App.jsx        Top-level state, all handlers, tab management, modal orchestration, drag-drop gestures, layout
  styles.css     Responsive light/dark theme, focus/reduced-motion states and all component styling
  lib/
    graphLayout.js  computeGraph() lane assignment + edge paths + graphWidth() (the graph algorithm)
    preview.js      buildPreview(repo, action) → simulated ghost commit list + plain-language note; simulateRebaseTodo()
    actions.js      getActionMeta(action, repo) → title, real git command, explanation, input/preview flags
    diff.js         splitHunks/buildHunkPatch (hunk staging), wordDiff (intra-line, bounded), isPatchable
    glossary.js     Plain-language Git term definitions (tooltips + Help panel)
    format.js       relativeTime, fullDate, shortHash, initials, avatarColor
    avatar.js       email → GitHub/Gravatar avatar URL
    md5.js          vendored MD5 (Gravatar hashing; Web Crypto has no MD5)
    github.js       parseGitHubRemote(url) (precise host match), buildCompareUrl(...)
    slug.js         slugifyBranch(freeText) → valid git branch name
    commitMessage.js Validate and append standard co-author trailers
    recentRepos.js  Normalise, deduplicate and order the recent-repository list
    helpContext.js  React context to open the Help panel at a term
  components/      Toolbar, TabBar, Sidebar, GraphView, GraphSvg, CommitDetails, StagingPanel,
                   ActionModal, ConflictPanel, DiffView, DiffModal, ContextMenu, PRModal, CloneModal,
                   SettingsModal, RemoteModal, CompareModal, InteractiveRebaseModal, HistoryPanel,
                   FileInspectorPanel, WorktreeModal, CommandPalette, GitHubPanel, ActivityPanel,
                   WelcomeScreen, HelpPanel, ErrorBoundary, Avatar, Term, Toasts, Icon
tests/           Unit/static-contract tests plus integration tests against real temporary Git repositories
build/           App icons (icon.svg + generated icon.icns/ico/png) and mac entitlements (buildResources)
.github/workflows/release.yml   Cross-platform build + publish to GitHub Releases on a version tag
```

### Conventions (follow these)

- **Renderer imports are extensionless** (Vite resolves them), e.g. `import x from '../lib/format'`. **Exception:** a module that must also run under raw Node needs the explicit `.js` (e.g. `avatar.js` imports `./md5.js`, because the verification scripts import it).
- **Electron files are `.cjs`** (CommonJS) on purpose — `package.json` has `"type": "module"`, so `.cjs` keeps them CommonJS.
- **Icons** are inline SVG in `components/Icon.jsx` (`<Icon name="..." />`) — no icon font, no emoji.
- **Themes** use CSS variables in `styles.css`; `system`, `light` and `dark` are selected in Settings.
- **Tests** use Node’s built-in runner. Integration tests operate only on temporary repositories and local Git config.

### Key systems

- **Graph layout** (`graphLayout.js`): processes commits newest-first, assigns each a lane (leftmost lane awaiting it, else a new one), first parent continues the lane (straight line), extra parents (merges) branch to new lanes. A post-pass resolves each edge's target lane to where the parent commit *actually* landed (parents reserved in multiple lanes collapse to the leftmost). Edge bends: merges bend near the child (top), branch-base edges bend near the parent (bottom).
- **Previews** (`preview.js`): pure functions that clone the commit list and add flagged `ghost` nodes/refs — **no git is run**. `buildPreview(repo, action)` dispatches per action type and returns `{ commits, note }`. The same `computeGraph` renders it in the modals.
- **Conflicts** (`git.cjs` `getConflictState`): detects `.git/MERGE_HEAD`, `rebase-merge`/`rebase-apply`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`. `continueOperation` uses prepared messages and non-interactive editor environment variables so Git never waits on an unavailable terminal.
- **Credentials** (`git.cjs` top): sets `GIT_TERMINAL_PROMPT=0` and SSH batch mode so remote operations fail fast. Authentication comes from the OS credential helper or SSH agent; GitVista refuses plaintext token storage when no secure Linux helper is configured.
- **Git environment allowlist** (`git.cjs` `createGit`): simple-git 4 removes every inherited `GIT_*` variable before it runs Git. The hardening variables are passed through by name in `ALLOWED_GIT_ENVIRONMENT`, so any new `GIT_*` setting must be added there or Git will never see it. Always create simple-git instances with `createGit`, never with `simpleGit` directly. An integration test reads the environment a Git hook receives to prove the allowlist works.
- **IPC security** (`ipc-validation.cjs`): each of the 83 channels has an exact arity and type/path/ref schema. `main.cjs` also rejects calls not originating from the main application frame.

---

## 5. How to add a new Git action (the most common extension)

The pieces are deliberately uniform. To add an action, touch these in order:

1. **`electron/git.cjs`** — add the function (use `simple-git`), export it.
2. **`electron/main.cjs`** — add an `ipcMain` handler in `registerIpc()`.
3. **`electron/preload.cjs`** — expose it on `window.api`.
4. **`src/lib/preview.js`** — add a `previewX()` that returns `{ commits, note }`, and a case in `buildPreview`.
5. **`src/lib/actions.js`** — add a case in `getActionMeta` (title, `command`, `explain`, `needsInput`, `graphPreview`, `destructive`).
6. **`src/App.jsx`** — add a branch in `runAction` (and an entry point: toolbar/sidebar/context-menu).
7. **UI** — the generic `ActionModal` already renders the preview + note + command + confirm; only build a custom modal for special inputs (like `PRModal`/`CloneModal`).

---

## 6. How to verify changes

Use the repeatable checks before treating a change as complete:

1. **`npm run check`** — runs unit tests, real temporary-repository integration tests, Electron syntax checks and the production renderer build.
2. **`npm audit --omit=dev --audit-level=high`** — checks production dependencies for high-severity vulnerabilities.
3. **Interaction pass** — run `npm run dev` and exercise both the welcome state and an active repository, including loading, error, empty and destructive-confirmation states. Check the developer console after the interaction.
4. **Accessibility pass** — test keyboard-only navigation, visible focus, screen-reader names, contrast, reduced motion and the layout at narrow and enlarged-text sizes.
5. **Packaging pass** — run `CSC_IDENTITY_AUTO_DISCOVERY=false npm run dist:dir`, launch the unpacked application and confirm `app.asar` contains `electron/`, `dist/index.html` and `node_modules/simple-git`.
6. **Release preflight** — run `npm run check:release`. It deliberately fails while `package.json` contains a placeholder repository URL.

Tests must only use temporary repositories and local Git configuration. Never mutate a developer's global Git configuration or operating-system keychain.

---

## 7. Known limitations & gotchas

- **Preview mini-graphs** show a small slice (top ~6–12 commits); a merge/reset/rebase target far down an 800-commit loaded history may fall outside the window, so the ghost graph can be approximate even though the plain-language explanation remains accurate.
- **Interactive rebase** flattens merges and has no edit/exec; it needs a clean working tree (warns up front). The reword/squash flow drives git's editors through `rebase-editor.cjs`.
- **Provider integration** currently supports GitHub through a fine-grained personal access token. It does not yet provide OAuth account switching, GitLab, Bitbucket or Azure DevOps support, inline review comments or CI logs.
- **Conflict resolution** provides safe current/incoming choices and a hand-edit workflow, but not a full three-pane merge editor with line-level combination.
- **macOS has the strongest interaction coverage**. Windows and Linux are configured and packaged, but still need the same depth of clean-machine, credential-helper and accessibility QA.
- **Per-tab selection is not persisted** — switching repositories resets the selected commit.

---

## 8. Deployment (packaging, signing, releases, auto-update)

GitVista ships as an Electron desktop app via **electron-builder** (config in `package.json` `build`). The renderer is pre-built by Vite into `dist/`; only `dist/`, `electron/`, and runtime deps go into the `app.asar`.

### Local builds

```bash
npm run dist:dir   # unpacked app into release/<platform>/ (fast smoke test)
npm run dist       # full installers (DMG+zip / NSIS / AppImage+deb) into release/
```

These commands are for local verification. Unless signing credentials are present, their artefacts are unsigned and should not be treated as public releases. The branded icons and macOS entitlements in `build/` are already wired.

### Signing and notarisation

- **macOS:** provide a Developer ID Application certificate through `CSC_LINK` and `CSC_KEY_PASSWORD`. For notarisation, also provide `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD` and `APPLE_TEAM_ID`. Hardened runtime and entitlements are configured in `package.json`.
- **Windows:** provide an Authenticode certificate through `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`. Public unsigned executables are likely to trigger trust warnings.
- **Linux:** publish checksums alongside AppImage/deb artefacts and test each target distribution. Package signing is a separate distribution decision.

Keep every credential in protected CI secrets. Do not place certificates, passwords, access tokens or Apple credentials in the repository or workflow file.

### Recommended release path

1. Keep `repository.url` in `package.json` pointing at the real repository, `https://github.com/REllwood/gitvista.git`. `npm run check:release` blocks publishing if it is ever changed back to a placeholder.
2. Configure protected signing and notarisation secrets for the release environment. Require manual environment approval for production releases.
3. Run `npm run check`, the production dependency audit and `npm run check:release` before creating a version tag.
4. Create the version and tag manually according to the project's release policy. `.github/workflows/release.yml` then builds on macOS, Windows and Linux and publishes through GitHub Releases.
5. Test the signed pre-release on clean machines, including first launch, clone/fetch/push credentials, update installation and rollback. Promote it only after those checks pass.
6. Retain release notes, checksums and a previous signed installer. Auto-update metadata is published with the installers and `electron-updater` checks it from signed production builds.

Users must have system **`git`** on PATH. Make that prerequisite explicit on the download page and in first-run troubleshooting.

---

## 9. Roadmap (gap analysis for migrating off GitKraken)

The core daily workflow is implemented: clone/open, staging and partial commits, history graph, branch/tag/stash/remote operations, warned force-with-lease pushes, merge/rebase/cherry-pick/revert/reset previews, conflicts, reflog recovery, command palette, history/blame/search, worktrees, profiles/signing, recent repositories and a focused GitHub dashboard.

### Tier 1 — biggest remaining parity gaps

- A visual three-way merge editor with editable result, per-hunk/line choices and conflict navigation.
- GitHub OAuth and multiple accounts, inline pull-request review comments and CI logs; equivalent GitLab, Bitbucket and Azure DevOps integrations.
- First-class submodule and Git LFS status, initialise/update/deinitialise workflows and safety explanations.

### Tier 2 — deeper power-user workflows

- Multi-select commit actions; annotated and signed tags; commit templates; line-level staging and patch editing.
- Interactive-rebase `edit`, `exec` and `--rebase-merges`, with pause/resume guidance.
- Configurable external diff/merge tools, terminal and file-manager actions, hook output, sparse checkout and deeper worktree management.

### Tier 3 — migration, scale and trust

- Grouped workspaces and favourites, plus an explicit GitKraken repository-list import.
- Enterprise provider features, proxy/custom-certificate support and organisation policy controls.
- Signed clean-machine QA on every platform, crash reporting with consent and redaction, localisation and performance testing on very large repositories.

---

## 10. Continuing development — prompt for a fresh agent

> Paste everything below (or just point the agent at this README) to resume work in a new session.

You are continuing **GitVista**, a beginner-friendly, GitKraken-style visual Git client built with **Electron + React (Vite) + simple-git, in JavaScript (no TypeScript)**. Read this README top to bottom first — it documents the purpose, architecture, conventions, what's implemented, and what isn't.

**Before writing code:**
- Confirm the environment: Node 22.12+, npm 10+ and `git` on PATH. Run `npm install`, then `npm run check` for the complete baseline.
- Internalise the conventions in §4: the `window.api` → validated IPC → `git.cjs` flow and the `{ ok, data } / { ok:false, error }` envelope; extensionless renderer imports (except modules also run under raw Node, which need `.js`); `.cjs` for Electron; inline SVG icons; CSS-variable themes.

**The product's identity — protect it:** the differentiator is the **live preview + plain-language teaching** of what each action will do. Any new action should show its ghost-preview and a plain explanation and the real git command (the `ActionModal` + `preview.js` + `actions.js` trio already make this easy — see §5).

**To add a Git action,** follow the 7-step recipe in §5 exactly. To add anything that runs git, it goes through `electron/git.cjs` only — never call git from the renderer.

**Verify like §6:** run the complete automated check, audit production dependencies, exercise the actual UI and package/launch the unpacked application. Add regression coverage against temporary repositories for Git behaviour. Never touch the user's global Git configuration or keychain in tests.

**What to build next:** use §9 as the product backlog. The highest-value gap is the three-way merge editor; provider OAuth and submodule/LFS workflows follow it. Keep additions end-to-end: backend operation, exact IPC validation, preload exposure, loading/error states, accessible UI, preview where relevant and regression tests.

**Do not:** introduce TypeScript or a different framework; bypass the IPC envelope; call Git from the renderer; add emoji to the UI or documentation; commit secrets; mutate global Git configuration/keychain in tests; silently ignore errors; or remove the preview/plain-language layer.
