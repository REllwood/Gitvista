# Security policy

## Supported versions

Security fixes go into the latest release only. Update to the newest version on the [releases page](https://github.com/REllwood/gitvista/releases/latest) before you report a problem.

## Report a vulnerability

Do not open a public issue. Report the problem privately through a [GitHub security advisory](https://github.com/REllwood/gitvista/security/advisories/new) and include:

- the GitVista version and your operating system
- the steps that reproduce the problem
- what an attacker could do with it

The maintainer reviews the report privately, works on a fix, and publishes the advisory with the release that contains the fix. Say in the report if you would like to be credited.

## What to report

Examples include:

- repository content, a remote or a file name that makes GitVista run a command or pass an unexpected option to Git
- a way to call the app's IPC channels with arguments that bypass validation
- reading or writing files outside the open repository
- exposure of a saved GitHub token or other credential
- loading remote content or navigating away inside the app window

Problems in Git itself belong with the [Git project](https://git-scm.com/community). The confirmation prompts shown because release builds are not yet signed are expected and are not a vulnerability.
