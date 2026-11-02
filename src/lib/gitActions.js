import { call } from './repositorySession.js'

const ACTIONS = {
  branch: ['createBranch', (a) => [a.name.trim(), true]],
  checkout: ['checkout', (a) => [a.ref]],
  merge: ['merge', (a) => [a.branch]],
  rebase: ['rebase', (a) => [a.onto]],
  cherryPick: ['cherryPick', (a) => [a.hash]],
  revert: ['revert', (a) => [a.hash]],
  tag: ['createTag', (a) => [a.name.trim(), a.hash]],
  branchAt: ['branchAt', (a) => [a.name.trim(), a.hash, true]],
  reset: ['reset', (a) => [a.hash, a.mode]],
  restore: ['reset', (a) => [a.hash, 'hard']],
  uncommit: ['uncommit', (a) => []],
  amend: ['amend', (a) => [a.message]],
  renameBranch: ['renameBranch', (a) => [a.oldName, a.name.trim()]],
  renameRemote: ['renameRemote', (a) => [a.oldName, a.name.trim()]],
  moveBranch: ['moveBranch', (a) => [a.name, a.hash]],
  checkoutRemote: ['checkoutRemote', (a) => [a.ref]],
  fetch: ['fetch', (a) => []],
  pull: ['pull', (a) => []],
  push: ['push', (a) => []],
  forcePush: ['forcePush', (a) => []],
  stash: ['stash', (a) => [a.message, a.includeUntracked]],
  stashPop: ['stashPop', (a) => [a.index]],
  stashApply: ['stashApply', (a) => [a.index]],
  stashDrop: ['stashDrop', (a) => [a.index]],
  deleteBranch: ['deleteBranch', (a) => [a.name]],
  deleteTag: ['deleteTag', (a) => [a.name]],
  pushTag: ['pushTag', (a) => [a.name, a.remote || null]],
  deleteRemoteTag: ['deleteRemoteTag', (a) => [a.name, a.remote || null]],
  deleteRemoteBranch: ['deleteRemoteBranch', (a) => [a.name]],
}

export function executeGitAction(api, repoPath, action) {
  const spec = Object.hasOwn(ACTIONS, action.type) ? ACTIONS[action.type] : null
  if (!spec) throw new Error(`Unsupported Git action: ${action.type}`)
  const [method, args] = spec
  return call(api[method](repoPath, ...args(action)))
}

export function successMessage(a) {
  switch (a.type) {
    case 'branch':
      return `Created and switched to branch “${a.name.trim()}”.`
    case 'checkout':
      return `Switched to “${a.ref}”.`
    case 'merge':
      return `Merged “${a.branch}”.`
    case 'fetch':
      return 'Fetched the latest from the remote.'
    case 'pull':
      return 'Pulled the latest changes.'
    case 'push':
      return 'Pushed your commits to the remote.'
    case 'forcePush':
      return 'Force-pushed your branch to the remote.'
    case 'stash':
      return 'Your changes are safely stashed.'
    case 'stashPop':
      return 'Brought your stashed changes back.'
    case 'stashApply':
      return 'Applied the stash (and kept it in the list).'
    case 'stashDrop':
      return 'Deleted the stash.'
    case 'deleteBranch':
      return `Deleted branch “${a.name}”.`
    case 'deleteTag':
      return `Deleted tag “${a.name}”.`
    case 'pushTag':
      return `Pushed tag “${a.name}” to the remote.`
    case 'deleteRemoteTag':
      return `Deleted tag “${a.name}” from the remote.`
    case 'deleteRemoteBranch':
      return `Deleted branch “${a.name}” from the remote.`
    case 'amend':
      return 'Your last commit was amended.'
    case 'renameBranch':
      return `Renamed branch to “${a.name.trim()}”.`
    case 'renameRemote':
      return `Renamed remote “${a.oldName}” to “${a.name.trim()}”.`
    case 'moveBranch':
      return `Moved branch “${a.name}”.`
    case 'checkoutRemote':
      return `Checked out “${a.ref}”.`
    case 'cherryPick':
      return 'Copied that commit onto your branch.'
    case 'revert':
      return 'Added a commit that undoes those changes.'
    case 'rebase':
      return `Replayed your commits on top of “${a.onto}”.`
    case 'tag':
      return `Tagged as “${a.name.trim()}”.`
    case 'branchAt':
      return `Created and switched to “${a.name.trim()}”.`
    case 'reset':
      return 'Moved your branch.'
    case 'uncommit':
      return 'Last commit undone — its changes are staged for you.'
    case 'restore':
      return 'Restored to the selected point in your history.'
    default:
      return 'Done.'
  }
}

