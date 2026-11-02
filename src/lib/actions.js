// Per-action metadata: the plain-language title/explanation a beginner sees,
// plus the real git command so they gradually learn what's happening underneath.

export function getActionMeta(action, repo) {
  const cur = repo?.currentBranch || 'your current branch'
  const sh = (action.hash || '').slice(0, 7)
  switch (action.type) {
    case 'branch':
      return {
        title: 'Create a new branch',
        confirmLabel: 'Create branch',
        command: `git switch -c ${action.name?.trim() || '<name>'}`,
        explain: `A branch is a separate line of work. GitVista switches you onto the new branch, so your next commits go there instead of onto “${cur}”.`,
        needsInput: 'name',
        inputLabel: 'Name your branch',
        inputPlaceholder: 'e.g. feature/login',
        graphPreview: true,
      }
    case 'checkout':
      return {
        title: `Switch to “${action.ref}”`,
        confirmLabel: 'Switch',
        command: `git switch ${action.ref}`,
        explain: `Your files will change to match “${action.ref}”, and the HEAD marker (“you are here”) moves there. None of your saved commits are lost.`,
        graphPreview: true,
      }
    case 'merge':
      return {
        title: `Merge “${action.branch}” into ${cur}`,
        confirmLabel: 'Merge',
        command: `git merge ${action.branch}`,
        explain: `This brings the work from “${action.branch}” into “${cur}”. If both branches changed the same lines, Git will pause and ask you to resolve a conflict.`,
        graphPreview: true,
      }
    case 'rebase':
      return {
        title: `Replay “${cur}” on top of “${action.onto}”`,
        confirmLabel: 'Rebase',
        command: `git rebase ${action.onto}`,
        explain: `Lifts your “${cur}” commits and re-applies them on top of the latest “${action.onto}”, so your history stays a straight line with no merge commit. This rewrites your branch's commits (their IDs change), so avoid it on work you have already shared.`,
        graphPreview: true,
      }
    case 'cherryPick':
      return {
        title: `Copy this commit onto ${cur}`,
        confirmLabel: 'Cherry-pick',
        command: `git cherry-pick ${sh}`,
        explain: `Takes the changes from this one commit and adds them as a brand-new commit on “${cur}”. The original commit stays exactly where it is.`,
        graphPreview: true,
      }
    case 'revert':
      return {
        title: 'Undo the changes from this commit',
        confirmLabel: 'Revert',
        command: `git revert ${sh}`,
        explain: `Creates a new commit that reverses what this commit did. History is not rewritten, so use this to undo a commit you have already pushed.`,
        graphPreview: true,
      }
    case 'tag':
      return {
        title: 'Tag this commit',
        confirmLabel: 'Add tag',
        command: `git tag ${action.name?.trim() || '<name>'} ${sh}`,
        explain: 'Pins a fixed name, often a version like “v1.0”, to this exact commit so you can find it later.',
        needsInput: 'name',
        inputLabel: 'Tag name',
        inputPlaceholder: 'e.g. v1.0',
        graphPreview: true,
      }
    case 'branchAt':
      return {
        title: 'Create a branch here',
        confirmLabel: 'Create branch',
        command: `git switch -c ${action.name?.trim() || '<name>'} ${sh}`,
        explain: 'Starts a new branch from this commit and switches you onto it, so you can build from this exact point in history.',
        needsInput: 'name',
        inputLabel: 'Branch name',
        inputPlaceholder: 'e.g. hotfix',
        graphPreview: true,
      }
    case 'reset': {
      const mode = action.mode || 'mixed'
      const explain = {
        soft: `Moves “${cur}” to this commit, but keeps all changes from the undone commits staged and ready to re-commit. Nothing is lost.`,
        mixed: `Moves “${cur}” to this commit. Changes from the undone commits remain as edits in your working files (unstaged) so you can review them. Nothing is lost.`,
        hard: `Moves “${cur}” to this commit and discards the undone commits along with any uncommitted changes. This is hard to undo.`,
      }[mode]
      const verb = { soft: 'keep changes staged', mixed: 'keep changes in files', hard: 'discard changes' }[mode]
      return {
        title: `Move “${cur}” here (${verb})`,
        confirmLabel: mode === 'hard' ? 'Reset & discard' : 'Reset',
        command: `git reset --${mode} ${sh}`,
        explain,
        destructive: mode === 'hard',
        graphPreview: true,
      }
    }
    case 'uncommit':
      return {
        title: 'Undo your last commit',
        confirmLabel: 'Undo commit',
        command: 'git reset --soft HEAD~1',
        explain: 'Removes the most recent commit but keeps all of its changes staged, so you can fix the message or contents and commit again. Nothing is lost.',
        graphPreview: true,
      }
    case 'amend':
      return {
        title: 'Amend your last commit',
        confirmLabel: 'Amend commit',
        command: 'git commit --amend',
        explain: `Replaces your most recent commit with a new one that includes whatever you have staged and uses this message. Use it to fix a typo or add a forgotten file. It rewrites that commit (new ID), so avoid amending commits you have already pushed.`,
        needsInput: 'text',
        inputField: 'message',
        inputLabel: 'Commit message',
        inputPlaceholder: 'Describe the commit…',
        initialValue: action.message || '',
        graphPreview: true,
      }
    case 'renameBranch':
      return {
        title: `Rename branch “${action.oldName}”`,
        confirmLabel: 'Rename branch',
        command: `git branch -m ${action.oldName} ${action.name?.trim() || '<new-name>'}`,
        explain: `Changes the branch name from “${action.oldName}” to the new name. The commits do not change.`,
        needsInput: 'name',
        inputLabel: 'New branch name',
        inputPlaceholder: 'e.g. feature/login',
        graphPreview: true,
      }
    case 'renameRemote':
      return {
        title: `Rename remote “${action.oldName}”`,
        explain: 'Changes the local nickname for this remote. It does not rename or alter the hosted repository.',
        command: `git remote rename ${action.oldName} ${action.name || '<new-name>'}`,
        confirmLabel: 'Rename remote',
        needsInput: 'name',
        inputLabel: 'New remote name',
        initialValue: action.oldName || '',
      }
    case 'moveBranch':
      return {
        title: `Move branch “${action.name}” here`,
        confirmLabel: 'Move branch',
        command: `git branch -f ${action.name} ${sh}`,
        explain: `Points the “${action.name}” branch label at this commit. Only the label moves, so your current branch and working files do not change. Commits that “${action.name}” used to include may become unreachable from it.`,
        destructive: true,
        graphPreview: true,
      }
    case 'checkoutRemote':
      return {
        title: `Check out “${action.ref}”`,
        confirmLabel: 'Check out',
        command: `git switch --track ${action.ref}`,
        explain: `Creates a local branch that follows the remote branch “${action.ref}” and switches you onto it, so you can work on it and push your changes back.`,
        graphPreview: true,
      }
    case 'deleteTag':
      return {
        title: `Delete tag “${action.name}”`,
        confirmLabel: 'Delete tag',
        command: `git tag -d ${action.name}`,
        explain: `Removes the tag label “${action.name}”. The commit it pointed to stays in history. If you already pushed the tag, it stays on the remote until you delete it there too.`,
        destructive: true,
        graphPreview: false,
      }
    case 'pushTag':
      return {
        title: `Push tag “${action.name}”`,
        confirmLabel: 'Push tag',
        command: `git push ${action.remote || '<remote>'} refs/tags/${action.name}`,
        explain: `Publishes the tag “${action.name}” to the remote so teammates and release tools can see it. The commit and local tag are unchanged.`,
        graphPreview: false,
      }
    case 'deleteRemoteTag':
      return {
        title: `Delete remote tag “${action.name}”`,
        confirmLabel: 'Delete remote tag',
        command: `git push ${action.remote || '<remote>'} :refs/tags/${action.name}`,
        explain: `Removes “${action.name}” from the shared remote. Other people may already have fetched it, and your local tag will remain until you delete that separately.`,
        destructive: true,
        graphPreview: false,
      }
    case 'deleteRemoteBranch':
      return {
        title: `Delete remote branch “${action.name}”`,
        confirmLabel: 'Delete remote branch',
        command: `git push ${action.name?.split('/')[0] || '<remote>'} --delete ${action.name?.split('/').slice(1).join('/') || '<branch>'}`,
        explain: `Permanently removes “${action.name}” from the shared remote. Teammates may still have local copies, but new clones and fetches will no longer see this branch. Confirm that its work is merged or no longer needed.`,
        destructive: true,
        graphPreview: false,
      }
    case 'stashApply':
      return {
        title: 'Apply stash (and keep it)',
        confirmLabel: 'Apply stash',
        command: `git stash apply stash@{${action.index}}`,
        explain: 'Brings the stashed changes back into your working files but keeps the stash in the list, so you can apply it again on another branch.',
        graphPreview: false,
      }
    case 'stashDrop':
      return {
        title: 'Delete this stash',
        confirmLabel: 'Delete stash',
        command: `git stash drop stash@{${action.index}}`,
        explain: 'Permanently removes this stash from the list. Whatever changes it held are discarded. Apply it first if you still want them.',
        destructive: true,
        graphPreview: false,
      }
    case 'restore':
      return {
        title: 'Restore to this point',
        confirmLabel: 'Restore (hard reset)',
        command: `git reset --hard ${sh || '<commit>'}`,
        explain: `Moves “${cur}” back to this point from your history and makes your files match it exactly. Commits made after this point, and any uncommitted changes, are discarded. This is a hard reset, so be sure before you confirm.`,
        destructive: true,
        graphPreview: true,
      }
    case 'fetch':
      return {
        title: 'Fetch from remote',
        confirmLabel: 'Fetch',
        command: 'git fetch --all --prune',
        explain: 'Downloads the latest commits from the remote so you can see what is new. It does not change your branches or files.',
        graphPreview: true,
      }
    case 'pull':
      return {
        title: 'Pull from remote',
        confirmLabel: 'Pull',
        command: 'git pull',
        explain: 'Downloads new commits from the remote and merges them into your current branch in one step.',
        graphPreview: true,
      }
    case 'push':
      return {
        title: 'Push to remote',
        confirmLabel: 'Push',
        command: 'git push',
        explain: 'Uploads the commits you have made locally to the shared remote so your team can see them.',
        graphPreview: true,
      }
    case 'forcePush':
      return {
        title: `Force-push “${cur}” to the remote`,
        confirmLabel: 'Force push',
        command: 'git push --force-with-lease',
        explain: `This overwrites the remote branch with your local history. You need it after a rebase or amend, but it can erase commits on the remote. With “--force-with-lease”, Git refuses if the remote changed since your last fetch, so you cannot overwrite a teammate's new work without seeing it. Only force-push branches that are yours.`,
        destructive: true,
        graphPreview: true,
      }
    case 'stash':
      return {
        title: 'Stash your changes',
        confirmLabel: 'Stash changes',
        command: `git stash push${action.includeUntracked ? ' --include-untracked' : ''}${action.message?.trim() ? ` -m "${action.message.trim()}"` : ''}`,
        explain: 'Tucks your uncommitted changes away and gives you a clean working directory. You can bring them back later with “Unstash”.',
        needsInput: 'text',
        inputField: 'message',
        inputLabel: 'Description (optional)',
        inputPlaceholder: 'e.g. half-finished login form',
        optional: true,
        toggle: { key: 'includeUntracked', label: 'Also stash brand-new (untracked) files' },
        graphPreview: true,
      }
    case 'stashPop':
      return {
        title: 'Unstash your changes',
        confirmLabel: 'Unstash',
        command: `git stash pop stash@{${action.index}}`,
        explain: `Brings ${action.index === 0 ? 'your most recently stashed changes' : 'the changes saved in this stash'} back into your working directory and removes the stash from the list. To keep a copy of the stash, apply it instead of unstashing.`,
        graphPreview: false,
      }
    case 'deleteBranch':
      return {
        title: `Delete branch “${action.name}”`,
        confirmLabel: 'Delete branch',
        command: `git branch -d ${action.name}`,
        explain: `Removes the branch label “${action.name}”. The commits themselves stay in history if another branch still includes them. Git will refuse if this branch has unmerged work.`,
        destructive: true,
        graphPreview: false,
      }
    default:
      return { title: 'Confirm', confirmLabel: 'Confirm', command: '', explain: '', graphPreview: false }
  }
}
