const path = require('path')

function requiredString(value, label = 'value', maxLength = 8192) {
  if (typeof value !== 'string' || !value.trim() || value.length > maxLength || /[\0\r\n]/.test(value)) {
    throw new Error(`${label} is not valid.`)
  }
}

function optionalString(value, label = 'value', maxLength = 8192) {
  if (value == null || value === '') return
  requiredString(value, label, maxLength)
}

function textValue(value, label = 'text', maxLength = 100000, optional = true) {
  if (optional && (value == null || value === '')) return
  if (typeof value !== 'string' || (!optional && !value.trim()) || value.length > maxLength || value.includes('\0')) {
    throw new Error(`${label} is not valid.`)
  }
}

function absolutePath(value, label = 'path') {
  requiredString(value, label, 4096)
  if (!path.isAbsolute(value)) throw new Error(`${label} must be an absolute path.`)
}

function optionalAbsolutePath(value, label = 'path') {
  if (value == null || value === '') return
  absolutePath(value, label)
}

function repositoryFile(value, label = 'file path') {
  requiredString(value, label, 4096)
  if (path.isAbsolute(value)) throw new Error(`${label} must stay inside the repository.`)
  const parts = value.split(/[\\/]+/)
  if (parts.includes('..')) throw new Error(`${label} must stay inside the repository.`)
}

function folderName(value) {
  requiredString(value, 'Folder name', 255)
  if (value === '.' || value === '..' || /[\\/]/.test(value)) throw new Error('Folder name must be a single folder.')
}

function optionalFolderName(value) {
  if (value == null || value === '') return
  folderName(value)
}

function gitArgument(value, label = 'Git name') {
  requiredString(value, label, 4096)
  if (value.startsWith('-')) throw new Error(`${label} cannot begin with a dash.`)
}

function optionalGitArgument(value, label = 'Git name') {
  if (value == null || value === '') return
  gitArgument(value, label)
}

function remoteUrl(value) {
  requiredString(value, 'Remote URL', 8192)
  if (value.startsWith('-')) throw new Error('Remote URL cannot begin with a dash.')
}

const CONFIG_KEYS = new Set([
  'user.name',
  'user.email',
  'pull.rebase',
  'commit.gpgsign',
  'user.signingkey',
  'gpg.format',
])
function configKey(value) {
  requiredString(value, 'Configuration key', 128)
  if (!CONFIG_KEYS.has(value)) throw new Error('That Git configuration setting is not supported.')
}

function configValue(value) {
  if (value == null || value === '') return
  requiredString(value, 'Configuration value', 4096)
}

function credentialHost(value) {
  requiredString(value, 'Credential host', 253)
  let parsed
  try {
    parsed = new URL(`https://${value}`)
  } catch {
    throw new Error('Credential host is not valid.')
  }
  if (parsed.host !== value || parsed.pathname !== '/' || parsed.username || parsed.password) {
    throw new Error('Credential host is not valid.')
  }
}

function booleanValue(value, label = 'value') {
  if (typeof value !== 'boolean') throw new Error(`${label} must be true or false.`)
}

function optionalBoolean(value, label = 'value') {
  if (value == null) return
  booleanValue(value, label)
}

function nonNegativeInteger(value, label = 'value') {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative whole number.`)
}

function positiveInteger(value, label = 'value') {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive whole number.`)
}

function scope(value) {
  if (!['global', 'local'].includes(value)) throw new Error('Configuration scope must be global or local.')
}

function resetMode(value) {
  if (!['soft', 'mixed', 'hard'].includes(value)) throw new Error('Reset mode is not valid.')
}

function conflictSide(value) {
  if (!['ours', 'theirs'].includes(value)) throw new Error('Conflict side is not valid.')
}

function operationKind(value) {
  if (!['merge', 'rebase', 'cherry-pick', 'revert'].includes(value)) throw new Error('Git operation is not valid.')
}

function historySearchKind(value) {
  if (!['history', 'pickaxe'].includes(value)) throw new Error('History search mode is not valid.')
}

function mergeMethod(value) {
  if (!['merge', 'squash', 'rebase'].includes(value)) throw new Error('Pull request merge method is not valid.')
}

function interactiveRebaseBase(value) {
  if (value === '--root') return
  gitArgument(value, 'Rebase base')
}

function reviewEvent(value) {
  if (!['APPROVE', 'REQUEST_CHANGES', 'COMMENT'].includes(value)) throw new Error('Pull request review type is not valid.')
}

function commitSha(value) {
  requiredString(value, 'Commit ID', 64)
  if (!/^[0-9a-f]{40,64}$/i.test(value)) throw new Error('Commit ID is not valid.')
}

function rebaseTodo(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1000) throw new Error('Interactive rebase steps are not valid.')
  for (const item of value) {
    if (!item || typeof item !== 'object') throw new Error('Interactive rebase step is not valid.')
    if (!['pick', 'reword', 'squash', 'fixup', 'drop'].includes(item.action)) throw new Error('Interactive rebase action is not valid.')
    gitArgument(item.hash, 'Commit ID')
    textValue(item.message, 'Commit message', 100000)
  }
}

function credential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Credential details are not valid.')
  credentialHost(value.host)
  requiredString(value.username, 'Credential username', 1024)
  requiredString(value.token, 'Credential token', 10000)
  optionalString(value.protocol, 'Credential protocol', 16)
  if (value.protocol && value.protocol !== 'https') throw new Error('Only HTTPS credentials can be stored.')
}

function httpsUrl(value) {
  requiredString(value, 'External URL', 8192)
  let parsed
  try {
    parsed = new URL(value)
  } catch {
    throw new Error('External URL is not valid.')
  }
  if (parsed.protocol !== 'https:' || !parsed.hostname) throw new Error('Only secure HTTPS links can be opened.')
}

const string = (value) => requiredString(value)
const optionalText = (value) => textValue(value, 'text', 100000)
const requiredText = (value) => textValue(value, 'text', 100000, false)
const repo = (value) => absolutePath(value, 'Repository path')
const file = (value) => repositoryFile(value)
const revision = (value) => gitArgument(value, 'Git revision')
const gitName = (value) => gitArgument(value, 'Git name')
const optionalFile = (value) => {
  if (value == null || value === '') return
  repositoryFile(value)
}

const schemas = {
  'repo:choose': [],
  'repo:isGit': [repo],
  'repo:init': [repo],
  'repo:data': [repo],
  'repo:status': [repo],
  'history:search': [repo, string, historySearchKind],
  'repo:watchStart': [repo],
  'repo:watchStop': [repo],
  'commit:files': [repo, revision],
  'file:diff': [repo, file, booleanValue],
  'stage:file': [repo, file],
  'unstage:file': [repo, file],
  'stage:all': [repo],
  'unstage:all': [repo],
  'stage:hunk': [repo, optionalText],
  'unstage:hunk': [repo, optionalText],
  'discard:file': [repo, file],
  'action:commit': [repo, optionalText],
  'action:createBranch': [repo, gitName, booleanValue],
  'action:checkout': [repo, revision],
  'action:merge': [repo, revision],
  'action:fetch': [repo],
  'action:pull': [repo],
  'action:push': [repo],
  'action:forcePush': [repo],
  'action:pushTag': [repo, gitName, (value) => optionalGitArgument(value, 'Remote name')],
  'action:deleteRemoteTag': [repo, gitName, (value) => optionalGitArgument(value, 'Remote name')],
  'action:deleteRemoteBranch': [repo, gitName],
  'action:amend': [repo, optionalText],
  'action:checkoutRemote': [repo, gitName],
  'action:renameBranch': [repo, gitName, gitName],
  'action:moveBranch': [repo, gitName, revision],
  'action:stash': [repo, optionalText, optionalBoolean],
  'action:stashPop': [repo, nonNegativeInteger],
  'action:stashApply': [repo, nonNegativeInteger],
  'action:stashDrop': [repo, nonNegativeInteger],
  'action:deleteBranch': [repo, gitName],
  'remote:add': [repo, gitName, remoteUrl],
  'remote:remove': [repo, gitName],
  'remote:rename': [repo, gitName, gitName],
  'branch:setUpstream': [repo, gitName, gitName],
  'branch:unsetUpstream': [repo, gitName],
  'worktree:list': [repo],
  'worktree:add': [repo, absolutePath, folderName, revision, (value) => optionalGitArgument(value, 'Branch name')],
  'repo:reflog': [repo],
  'repo:undoTarget': [repo],
  'commit:fileDiff': [repo, revision, file, optionalFile],
  'file:content': [repo, file],
  'file:history': [repo, file, (value) => optionalGitArgument(value, 'Git revision')],
  'file:blame': [repo, file, (value) => optionalGitArgument(value, 'Git revision')],
  'compare:changed': [repo, revision, revision],
  'compare:diff': [repo, revision, revision, optionalFile, optionalFile],
  'action:cherryPick': [repo, revision],
  'action:revert': [repo, revision],
  'action:rebase': [repo, revision],
  'action:interactiveRebase': [repo, interactiveRebaseBase, rebaseTodo],
  'action:createTag': [repo, gitName, revision],
  'action:deleteTag': [repo, gitName],
  'action:branchAt': [repo, gitName, revision, booleanValue],
  'action:reset': [repo, revision, resetMode],
  'action:uncommit': [repo],
  'conflict:resolveUsing': [repo, file, conflictSide],
  'conflict:markResolved': [repo, file],
  'conflict:abort': [repo, operationKind],
  'conflict:continue': [repo, operationKind],
  'repo:clone': [absolutePath, remoteUrl, optionalFolderName],
  'config:get': [scope, optionalAbsolutePath],
  'config:set': [scope, configKey, configValue, optionalAbsolutePath],
  'identity:get': [optionalAbsolutePath],
  'git:version': [],
  'creds:store': [credential],
  'dialog:chooseDir': [(value) => optionalString(value, 'Dialog title', 255)],
  'sandbox:create': [],
  'shell:openRepoFile': [repo, file],
  'clipboard:writeText': [(value) => textValue(value, 'Clipboard text', 100000, false)],
  'shell:openExternal': [httpsUrl],
  'updater:getStatus': [],
  'updater:install': [],
  'github:listPullRequests': [repo],
  'github:listIssues': [repo],
  'github:getPullRequest': [repo, positiveInteger],
  'github:mergePullRequest': [repo, positiveInteger, mergeMethod, commitSha],
  'github:createReview': [repo, positiveInteger, reviewEvent, optionalText, commitSha],
}

function validateIpcArgs(channel, args) {
  const validators = schemas[channel]
  if (!validators) throw new Error(`IPC channel is not registered: ${channel}`)
  if (!Array.isArray(args) || args.length !== validators.length) throw new Error(`IPC arguments are not valid for ${channel}.`)
  validators.forEach((validate, index) => validate(args[index]))
  if ((channel === 'config:get' || channel === 'config:set') && args[0] === 'local' && !args.at(-1)) {
    throw new Error('A repository is required for local Git settings.')
  }
}

module.exports = { validateIpcArgs, httpsUrl, repositoryFile, schemas }
