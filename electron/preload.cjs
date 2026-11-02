const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel, ...args) => ipcRenderer.invoke(channel, ...args)
const subscribe = (channel, listener) => {
  if (typeof listener !== 'function') return () => {}
  const handler = (_event, data) => listener(data)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

// The only surface the renderer can touch. Everything returns the
// { ok, data } / { ok:false, error } envelope produced in main.cjs.
contextBridge.exposeInMainWorld('api', {
  chooseRepo: () => invoke('repo:choose'),
  isGitRepo: (p) => invoke('repo:isGit', p),
  initRepo: (p) => invoke('repo:init', p),
  getRepoData: (p) => invoke('repo:data', p),
  getStatus: (p) => invoke('repo:status', p),
  searchHistory: (p, query, kind) => invoke('history:search', p, query, kind),
  startRepositoryWatch: (p) => invoke('repo:watchStart', p),
  stopRepositoryWatch: (p) => invoke('repo:watchStop', p),
  onRepositoryChanged: (listener) => subscribe('repo:changed', listener),
  onRepositoryWatchError: (listener) => subscribe('repo:watchError', listener),
  onOperationStatus: (listener) => subscribe('operation:status', listener),
  getCommitFiles: (p, hash) => invoke('commit:files', p, hash),
  getFileDiff: (p, file, staged) => invoke('file:diff', p, file, staged),

  stageFile: (p, file) => invoke('stage:file', p, file),
  unstageFile: (p, file) => invoke('unstage:file', p, file),
  stageAll: (p) => invoke('stage:all', p),
  unstageAll: (p) => invoke('unstage:all', p),
  stageHunk: (p, patch) => invoke('stage:hunk', p, patch),
  unstageHunk: (p, patch) => invoke('unstage:hunk', p, patch),
  discardFile: (p, file) => invoke('discard:file', p, file),

  commit: (p, message) => invoke('action:commit', p, message),
  amend: (p, message) => invoke('action:amend', p, message),
  createBranch: (p, name, checkout) => invoke('action:createBranch', p, name, checkout),
  checkout: (p, ref) => invoke('action:checkout', p, ref),
  checkoutRemote: (p, remoteBranch) => invoke('action:checkoutRemote', p, remoteBranch),
  renameBranch: (p, oldName, newName) => invoke('action:renameBranch', p, oldName, newName),
  moveBranch: (p, name, target) => invoke('action:moveBranch', p, name, target),
  merge: (p, branch) => invoke('action:merge', p, branch),
  fetch: (p) => invoke('action:fetch', p),
  pull: (p) => invoke('action:pull', p),
  push: (p) => invoke('action:push', p),
  forcePush: (p) => invoke('action:forcePush', p),
  pushTag: (p, tag, remote) => invoke('action:pushTag', p, tag, remote),
  deleteRemoteTag: (p, tag, remote) => invoke('action:deleteRemoteTag', p, tag, remote),
  deleteRemoteBranch: (p, branch) => invoke('action:deleteRemoteBranch', p, branch),
  stash: (p, message, includeUntracked) => invoke('action:stash', p, message, includeUntracked),
  stashPop: (p, index) => invoke('action:stashPop', p, index),
  stashApply: (p, index) => invoke('action:stashApply', p, index),
  stashDrop: (p, index) => invoke('action:stashDrop', p, index),
  deleteBranch: (p, name) => invoke('action:deleteBranch', p, name),
  addRemote: (p, name, url) => invoke('remote:add', p, name, url),
  removeRemote: (p, name) => invoke('remote:remove', p, name),
  renameRemote: (p, oldName, newName) => invoke('remote:rename', p, oldName, newName),
  setUpstream: (p, branch, upstream) => invoke('branch:setUpstream', p, branch, upstream),
  unsetUpstream: (p, branch) => invoke('branch:unsetUpstream', p, branch),
  getWorktrees: (p) => invoke('worktree:list', p),
  addWorktree: (p, parentDir, folderName, ref, newBranch) =>
    invoke('worktree:add', p, parentDir, folderName, ref, newBranch),
  getReflog: (p) => invoke('repo:reflog', p),
  getUndoTarget: (p) => invoke('repo:undoTarget', p),

  getCommitFileDiff: (p, hash, file, previousPath) => invoke('commit:fileDiff', p, hash, file, previousPath),
  getFileContent: (p, file) => invoke('file:content', p, file),
  getFileHistory: (p, file, ref) => invoke('file:history', p, file, ref),
  getFileBlame: (p, file, ref) => invoke('file:blame', p, file, ref),
  getChangedBetween: (p, a, b) => invoke('compare:changed', p, a, b),
  getDiffBetween: (p, a, b, file, previousPath) => invoke('compare:diff', p, a, b, file, previousPath),

  cherryPick: (p, hash) => invoke('action:cherryPick', p, hash),
  revert: (p, hash) => invoke('action:revert', p, hash),
  rebase: (p, onto) => invoke('action:rebase', p, onto),
  interactiveRebase: (p, base, todo) => invoke('action:interactiveRebase', p, base, todo),
  createTag: (p, name, hash) => invoke('action:createTag', p, name, hash),
  deleteTag: (p, name) => invoke('action:deleteTag', p, name),
  branchAt: (p, name, hash, checkout) => invoke('action:branchAt', p, name, hash, checkout),
  reset: (p, hash, mode) => invoke('action:reset', p, hash, mode),
  uncommit: (p) => invoke('action:uncommit', p),

  resolveUsing: (p, file, side) => invoke('conflict:resolveUsing', p, file, side),
  markResolved: (p, file) => invoke('conflict:markResolved', p, file),
  abortOperation: (p, kind) => invoke('conflict:abort', p, kind),
  continueOperation: (p, kind) => invoke('conflict:continue', p, kind),

  clone: (parentDir, url, name) => invoke('repo:clone', parentDir, url, name),
  chooseDirectory: (title) => invoke('dialog:chooseDir', title),
  getConfig: (scope, repoPath) => invoke('config:get', scope, repoPath),
  setConfig: (scope, key, value, repoPath) => invoke('config:set', scope, key, value, repoPath),
  getIdentity: (repoPath) => invoke('identity:get', repoPath),
  gitVersion: () => invoke('git:version'),
  storeCredential: (info) => invoke('creds:store', info),

  createSandbox: () => invoke('sandbox:create'),
  openRepoFile: (p, file) => invoke('shell:openRepoFile', p, file),
  writeClipboardText: (value) => invoke('clipboard:writeText', value),
  openExternal: (url) => invoke('shell:openExternal', url),
  getUpdaterStatus: () => invoke('updater:getStatus'),
  installUpdate: () => invoke('updater:install'),
  onUpdaterStatus: (listener) => subscribe('updater:status', listener),
  listGitHubPullRequests: (p) => invoke('github:listPullRequests', p),
  listGitHubIssues: (p) => invoke('github:listIssues', p),
  getGitHubPullRequest: (p, number) => invoke('github:getPullRequest', p, number),
  mergeGitHubPullRequest: (p, number, method, sha) => invoke('github:mergePullRequest', p, number, method, sha),
  createGitHubReview: (p, number, event, body, commitId) =>
    invoke('github:createReview', p, number, event, body, commitId),
})
