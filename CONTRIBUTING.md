# Contributing to GitVista

Thank you for helping. Bug fixes, new Git workflows, accessibility improvements and clearer wording are all welcome.

## Before you start

- For anything larger than a small fix, open an issue first so you and the maintainer can agree on the approach before you write code.
- Read the developer guide in the [README](README.md#1-product-principle). It covers the architecture, the conventions and how to add a Git action.

## Set up

You need Node 22.12 or later, npm 10 or later, and Git.

```bash
npm install
npm run dev
```

`npm run dev` starts the Vite dev server and opens GitVista with hot reload.

## Project rules

- **JavaScript only.** Do not add TypeScript or replace React and Vite.
- **Git stays in the main process.** The renderer never runs Git. A new Git operation goes through `electron/git.cjs`, an IPC handler in `electron/main.cjs` with an exact argument schema in `electron/ipc-validation.cjs`, and the preload bridge. Section 5 of the README lists the steps.
- **Previews.** Every action that changes history gets a preview, a plain-English explanation and the real `git` command it runs.
- **Plain wording.** Interface text is plain English with no emoji. Name the consequence of an action instead of calling it safe or easy.
- **Isolated tests.** Tests use temporary repositories and local Git configuration only. Never change a developer's global Git configuration or keychain.
- **No secrets.** Never commit tokens, passwords or signing certificates.

## Check your change

```bash
npm run check
npm audit --audit-level=high
```

`npm run check` runs the unit and integration tests, checks the Electron files and builds the renderer. Then run the app with `npm run dev` and try your change. Check its loading, error and empty states, use it with the keyboard, and look at it in the light and dark themes. Add a regression test for any new behaviour.

## Pull requests

- Branch from `main` and open a pull request into `main`.
- Keep each pull request to one change.
- Describe what changed and how you checked it. The pull request template lists the checks.
- CI must pass before a pull request can merge.

## Bugs and security problems

Report bugs with the [issue forms](https://github.com/REllwood/gitvista/issues/new/choose). Report security problems privately, as described in the [security policy](SECURITY.md).
