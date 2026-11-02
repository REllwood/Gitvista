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
        explain: `A branch is a safe, separate line of work. You'll be moved onto the new branch, so your next commits go there instead of onto “${cur}”.`,
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
        explain: `Lifts your “${cur}” commits and re-applies them on top of the latest “${action.onto}”, giving a clean straight line instead of a merge. This rewrites your branch's commits (their IDs change), so avoid it on work you've already shared.`,
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
        explain: `Creates a NEW commit that reverses what this commit did. It's the safe way to undo something — your history is fully preserved.`,
        graphPreview: true,
      }
    case 'tag':
      return {
        title: 'Tag this commit',
        confirmLabel: 'Add tag',
        command: `git tag ${action.name?.trim() || '<name>'} ${sh}`,
        explain: 'Pins a friendly, fixed name (often a version like “v1.0”) to this exact commit so you can find it easily later.',
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
        soft: `Moves “${cur}” to this commit, but keeps ALL changes from the undone commits staged and ready to re-commit. Nothing is lost.`,
        mixed: `Moves “${cur}” to this commit. Changes from the undone commits remain as edits in your working files (unstaged) so you can review them. Nothing is lost.`,
        hard: `Moves “${cur}” to this commit and DISCARDS the undone commits along with any uncommitted changes. This is hard to undo.`,
      }[mode]
      const verb = { soft: 'keep changes staged', mixed: 'keep changes in files', hard: 'discard changes' }[mode]
      return {
        title: `Move “${cur}” here — ${verb}`,
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
        explain: `Replaces your most recent commit with a new one that folds in whatever you've staged and uses this message — great for a typo or a forgotten file. It rewrites that commit (new id), so avoid amending commits you've already pushed.`,
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
        explain: `Changes the branch's label from “${action.oldName}” to the new name. The commits are untouched — only the name moves.`,
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
        explain: `Repoints the “${action.name}” branch label at this commit. It's just moving a label — your current branch and working files are untouched. Commits “${action.name}” used to include may become unreachable from it.`,
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
        explain: `Removes the tag label “${action.name}”. The commit it pointed to stays in history. If you'd already pushed the tag, it still exists on the remote until deleted there too.`,
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
        explain: 'Brings the stashed changes back into your working files but KEEPS the stash in the list, so you can apply it again on another branch.',
        graphPreview: false,
      }
    case 'stashDrop':
      return {
        title: 'Delete this stash',
        confirmLabel: 'Delete stash',
        command: `git stash drop stash@{${action.index}}`,
        explain: 'Permanently removes this stash from the list. Whatever changes it held are discarded — apply it first if you still want them.',
        destructive: true,
        graphPreview: false,
      }
    case 'restore':
      return {
        title: 'Restore to this point',
        confirmLabel: 'Restore (hard reset)',
        command: `git reset --hard ${sh || '<commit>'}`,
        explain: `Moves “${cur}” back to this point from your history and makes your files match it exactly. Any commits made after this point — and any uncommitted changes — are discarded. This is how you undo a mistake; it's a hard reset, so be sure.`,
        destructive: true,
        graphPreview: true,
      }
    case 'fetch':
      return {
        title: 'Fetch from remote',
        confirmLabel: 'Fetch',
        command: 'git fetch --all --prune',
        explain: 'Safely downloads the latest commits from the remote so you can see what’s new. It does not change your branches or files.',
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
        explain: 'Uploads the commits you’ve made locally to the shared remote so your team can see them.',
        graphPreview: true,
      }
    case 'forcePush':
      return {
        title: `Force-push “${cur}” to the remote`,
        confirmLabel: 'Force push',
        command: 'git push --force-with-lease',
        explain: `This OVERWRITES the remote branch with your local history — useful after a rebase or amend, but it can erase commits on the remote. “--force-with-lease” adds a safety net: it refuses if the remote changed since your last fetch, so you can’t silently clobber a teammate’s work. Only force-push branches that are yours.`,
        destructive: true,
        graphPreview: true,
      }
    case 'stash':
      return {
        title: 'Stash your changes',
        confirmLabel: 'Stash changes',
        command: `git stash push${action.includeUntracked ? ' --include-untracked' : ''}${action.message?.trim() ? ` -m "${action.message.trim()}"` : ''}`,
        explain: 'Tucks your uncommitted changes away safely and gives you a clean working directory. You can bring them back later with “Unstash”.',
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
