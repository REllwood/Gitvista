const { app, BrowserWindow, ipcMain, dialog, shell, clipboard } = require('electron')
const fs = require('fs')
const fsp = require('fs/promises')
const path = require('path')
const git = require('./git.cjs')
const github = require('./github.cjs')
const { createOperationGate } = require('./operation-gate.cjs')
const runMutation = createOperationGate()
const { validateIpcArgs, httpsUrl } = require('./ipc-validation.cjs')

const isDev = process.env.NODE_ENV === 'development'
const DEV_URL = 'http://127.0.0.1:5173'

let mainWindow = null
let appUpdater = null
let updaterStatus = { state: 'idle' }
let repositoryWatchers = []
let watchedRepository = null
let watchDebounce = null
let operationSequence = 0

const OPERATION_LABELS = Object.freeze({
  'repo:init': 'Initialising repository',
  'stage:file': 'Staging file',
  'unstage:file': 'Unstaging file',
  'stage:all': 'Staging all files',
  'unstage:all': 'Unstaging all files',
  'stage:hunk': 'Staging selected lines',
  'unstage:hunk': 'Unstaging selected lines',
  'discard:file': 'Discarding file changes',
  'action:commit': 'Creating commit',
  'action:createBranch': 'Creating branch',
  'action:checkout': 'Switching branch',
  'action:merge': 'Merging branch',
  'action:fetch': 'Fetching remotes',
  'action:pull': 'Pulling changes',
  'action:push': 'Pushing commits',
  'action:forcePush': 'Force-pushing with lease',
  'action:pushTag': 'Pushing tag',
  'action:deleteRemoteTag': 'Deleting remote tag',
  'action:deleteRemoteBranch': 'Deleting remote branch',
  'action:amend': 'Amending commit',
  'action:checkoutRemote': 'Creating tracking branch',
  'action:renameBranch': 'Renaming branch',
  'action:moveBranch': 'Moving branch',
  'action:stash': 'Stashing changes',
  'action:stashPop': 'Restoring stash',
  'action:stashApply': 'Applying stash',
  'action:stashDrop': 'Deleting stash',
  'action:deleteBranch': 'Deleting branch',
  'remote:add': 'Adding remote',
  'remote:remove': 'Removing remote',
  'remote:rename': 'Renaming remote',
  'branch:setUpstream': 'Setting upstream branch',
  'branch:unsetUpstream': 'Removing upstream branch',
  'worktree:add': 'Creating worktree',
  'action:cherryPick': 'Cherry-picking commit',
  'action:revert': 'Reverting commit',
  'action:rebase': 'Rebasing branch',
  'action:interactiveRebase': 'Running interactive rebase',
  'action:createTag': 'Creating tag',
  'action:deleteTag': 'Deleting tag',
  'action:branchAt': 'Creating branch',
  'action:reset': 'Resetting branch',
  'action:uncommit': 'Undoing commit',
  'conflict:resolveUsing': 'Resolving conflict',
  'conflict:markResolved': 'Marking conflict resolved',
  'conflict:abort': 'Aborting Git operation',
  'conflict:continue': 'Continuing Git operation',
  'repo:clone': 'Cloning repository',
  'config:set': 'Saving Git settings',
  'creds:store': 'Saving credential securely',
  'sandbox:create': 'Preparing learning repository',
  'github:mergePullRequest': 'Merging pull request',
  'github:createReview': 'Submitting pull request review',
})

function sendToRenderer(channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, data)
}

function setUpdaterStatus(status) {
  updaterStatus = status
  sendToRenderer('updater:status', status)
}

function closeRepositoryWatcher() {
  if (watchDebounce) clearTimeout(watchDebounce)
  watchDebounce = null
  for (const watcher of repositoryWatchers) watcher.close()
  repositoryWatchers = []
  watchedRepository = null
}

async function startRepositoryWatcher(repoPath) {
  const realPath = await fsp.realpath(repoPath)
  if (!(await git.isGitRepo(realPath))) throw new Error('This folder is no longer a Git repository.')
  const [gitDir, commonDir] = await Promise.all([
    git.getGitDirectory(realPath),
    git.getGitCommonDirectory(realPath),
  ])
  closeRepositoryWatcher()
  watchedRepository = repoPath
  const gitDirRelative = path.relative(realPath, gitDir)
  const gitDirInsideRoot =
    gitDir === realPath ||
    (gitDirRelative !== '..' && !gitDirRelative.startsWith(`..${path.sep}`) && !path.isAbsolute(gitDirRelative))
  const targets = [{ target: realPath, recursive: true }]
  if (!gitDirInsideRoot) targets.push({ target: gitDir, recursive: true })
  if (!gitDirInsideRoot && commonDir !== gitDir) {
    targets.push({ target: commonDir, recursive: false })
    const refsDir = path.join(commonDir, 'refs')
    if (fs.existsSync(refsDir)) targets.push({ target: refsDir, recursive: true })
  }

  const onChange = (_eventType, filename) => {
    const changed = String(filename || '').replace(/\\/g, '/')
    if (changed.startsWith('.git/objects/') || changed.startsWith('.git/logs/')) return
    if (watchDebounce) clearTimeout(watchDebounce)
    watchDebounce = setTimeout(() => {
      watchDebounce = null
      sendToRenderer('repo:changed', { path: watchedRepository })
    }, 220)
  }
  const onError = (error) => {
    sendToRenderer('repo:watchError', {
      path: watchedRepository,
      message: humanizeError(error?.message || String(error)),
    })
    closeRepositoryWatcher()
  }
  try {
    for (const { target, recursive } of targets) {
      const watcher = fs.watch(target, { recursive }, onChange)
      watcher.on('error', onError)
      watcher.unref()
      repositoryWatchers.push(watcher)
    }
  } catch (error) {
    closeRepositoryWatcher()
    throw error
  }
  return true
}

function operationStarted(channel) {
  const label = OPERATION_LABELS[channel]
  if (!label) return null
  const operation = {
    id: `${Date.now()}-${++operationSequence}`,
    channel,
    label,
    state: 'running',
    startedAt: Date.now(),
  }
  sendToRenderer('operation:status', operation)
  return operation
}

function operationFinished(operation, state, error) {
  if (!operation) return
  const finishedAt = Date.now()
  sendToRenderer('operation:status', {
    ...operation,
    state,
    error: error || null,
    finishedAt,
    durationMs: finishedAt - operation.startedAt,
  })
}

async function openSecureExternal(url) {
  httpsUrl(url)
  return shell.openExternal(new URL(url).toString())
}

function isTrustedIpcEvent(event) {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents) return false
  return !event.senderFrame || event.senderFrame === mainWindow.webContents.mainFrame
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#1a1b26',
    title: 'GitVista',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
    },
  })

  if (isDev) {
    mainWindow.loadURL(DEV_URL)
    // DevTools available on demand via Cmd/Ctrl+Alt+I — not auto-opened so the
    // first-run experience stays clean for non-technical users.
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  // Open external links (e.g. remote URLs) in the user's real browser.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    openSecureExternal(url).catch(() => {})
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url !== mainWindow.webContents.getURL()) event.preventDefault()
  })
  mainWindow.webContents.session.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false))

  mainWindow.on('closed', () => {
    closeRepositoryWatcher()
    mainWindow = null
  })
}

// Rewrites cryptic git errors (especially auth) into actionable guidance.
function humanizeError(message) {
  const m = message || ''
  if (/could not read Username|terminal prompts disabled|Authentication failed|Invalid username or password|could not read Password/i.test(m)) {
    return 'Authentication failed. GitVista uses your system Git credentials. Open Settings to save a GitHub token, or set up an SSH key.'
  }
  if (/Permission denied \(publickey\)|Host key verification failed/i.test(m)) {
    return 'The remote rejected your SSH key. Add your key to the SSH agent, or save a GitHub token in Settings to use HTTPS instead.'
  }
  if (/gpg failed to sign|failed to write commit object|Couldn't load public key|No private key/i.test(m)) {
    return 'Git could not sign the commit. Check the signing format and key in Settings, or temporarily turn commit signing off.'
  }
  if (/Could not resolve host|unable to access|Failed to connect|Connection (timed out|refused)|network is unreachable/i.test(m)) {
    return 'Could not reach the remote. Check your internet connection and that the repository URL is correct.'
  }
  if (/repository .* not found|remote: Repository not found/i.test(m)) {
    return 'Repository not found. Check the URL and that you have access to it.'
  }
  if (/stale info|force-with-lease|cannot lock ref|remote ref .* changed/i.test(m)) {
    return 'The remote branch changed since you last fetched, so Git declined the force-push to protect the new commits there. Fetch and review what changed before trying again.'
  }
  return m
}

function registerIpc() {
  // Every git call is wrapped so the renderer always receives a uniform
  // { ok, data } / { ok:false, error } envelope instead of a thrown rejection.
  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, ...args) => {
      let operation = null
      try {
        if (!isTrustedIpcEvent(event)) throw new Error('This request did not come from the GitVista application window.')
        validateIpcArgs(channel, args)
        // Report the operation only once it holds the gate, so a request turned
        // away because another operation is running is not logged as a failure.
        const data = await (OPERATION_LABELS[channel]
          ? runMutation(OPERATION_LABELS[channel], () => {
            operation = operationStarted(channel)
            return fn(...args)
          })
          : fn(...args))
        operationFinished(operation, 'succeeded')
        return { ok: true, data }
      } catch (err) {
        const error = humanizeError((err && err.message) || String(err))
        operationFinished(operation, 'failed', error)
        return { ok: false, error }
      }
    })
  }

  handle('repo:choose', async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: 'Open a Git repository',
      buttonLabel: 'Open',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  handle('repo:isGit', (p) => git.isGitRepo(p))
  handle('repo:init', (p) => git.initRepo(p))
  handle('repo:data', (p) => git.getRepoData(p))
  handle('repo:status', (p) => git.getStatus(p))
  handle('history:search', (p, query, kind) => git.searchHistory(p, query, kind))
  handle('repo:watchStart', (p) => startRepositoryWatcher(p))
  handle('repo:watchStop', (p) => {
    if (watchedRepository === p) closeRepositoryWatcher()
    return true
  })
  handle('commit:files', (p, hash) => git.getCommitFiles(p, hash))
  handle('file:diff', (p, file, staged) => git.getFileDiff(p, file, staged))

  handle('stage:file', (p, file) => git.stageFile(p, file))
  handle('unstage:file', (p, file) => git.unstageFile(p, file))
  handle('stage:all', (p) => git.stageAll(p))
  handle('unstage:all', (p) => git.unstageAll(p))
  handle('stage:hunk', (p, patch) => git.stageHunk(p, patch))
  handle('unstage:hunk', (p, patch) => git.unstageHunk(p, patch))
  handle('discard:file', (p, file) => git.discardFile(p, file))

  handle('action:commit', (p, message) => git.commit(p, message))
  handle('action:createBranch', (p, name, checkout) => git.createBranch(p, name, checkout))
  handle('action:checkout', (p, ref) => git.checkout(p, ref))
  handle('action:merge', (p, branch) => git.merge(p, branch))
  handle('action:fetch', (p) => git.fetch(p))
  handle('action:pull', (p) => git.pull(p))
  handle('action:push', (p) => git.push(p))
  handle('action:forcePush', (p) => git.forcePush(p))
  handle('action:pushTag', (p, tag, remote) => git.pushTag(p, tag, remote))
  handle('action:deleteRemoteTag', (p, tag, remote) => git.deleteRemoteTag(p, tag, remote))
  handle('action:deleteRemoteBranch', (p, branch) => git.deleteRemoteBranch(p, branch))
  handle('action:amend', (p, message) => git.amendCommit(p, message))
  handle('action:checkoutRemote', (p, remoteBranch) => git.checkoutRemote(p, remoteBranch))
  handle('action:renameBranch', (p, oldName, newName) => git.renameBranch(p, oldName, newName))
  handle('action:moveBranch', (p, name, target) => git.moveBranch(p, name, target))
  handle('action:stash', (p, message, includeUntracked) => git.stash(p, message, includeUntracked))
  handle('action:stashPop', (p, index) => git.stashPop(p, index))
  handle('action:stashApply', (p, index) => git.stashApply(p, index))
  handle('action:stashDrop', (p, index) => git.stashDrop(p, index))
  handle('action:deleteBranch', (p, name) => git.deleteBranch(p, name))
  handle('remote:add', (p, name, url) => git.addRemote(p, name, url))
  handle('remote:remove', (p, name) => git.removeRemote(p, name))
  handle('remote:rename', (p, oldName, newName) => git.renameRemote(p, oldName, newName))
  handle('branch:setUpstream', (p, branch, upstream) => git.setUpstream(p, branch, upstream))
  handle('branch:unsetUpstream', (p, branch) => git.unsetUpstream(p, branch))
  handle('worktree:list', (p) => git.getWorktrees(p))
  handle('worktree:add', (p, parentDir, folderName, ref, newBranch) =>
    git.addWorktree(p, parentDir, folderName, ref, newBranch)
  )
  handle('repo:reflog', (p) => git.getReflog(p))
  handle('repo:undoTarget', (p) => git.getUndoTarget(p))

  handle('commit:fileDiff', (p, hash, file, previousPath) => git.getCommitFileDiff(p, hash, file, previousPath))
  handle('file:content', (p, file) => git.getFileContent(p, file))
  handle('file:history', (p, file, ref) => git.getFileHistory(p, file, ref))
  handle('file:blame', (p, file, ref) => git.getFileBlame(p, file, ref))
  handle('compare:changed', (p, a, b) => git.getChangedBetween(p, a, b))
  handle('compare:diff', (p, a, b, file, previousPath) => git.getDiffBetween(p, a, b, file, previousPath))

  handle('action:cherryPick', (p, hash) => git.cherryPick(p, hash))
  handle('action:revert', (p, hash) => git.revertCommit(p, hash))
  handle('action:rebase', (p, onto) => git.rebase(p, onto))
  handle('action:interactiveRebase', (p, base, todo) => git.interactiveRebase(p, base, todo))
  handle('action:createTag', (p, name, hash) => git.createTag(p, name, hash))
  handle('action:deleteTag', (p, name) => git.deleteTag(p, name))
  handle('action:branchAt', (p, name, hash, checkout) => git.createBranchAt(p, name, hash, checkout))
  handle('action:reset', (p, hash, mode) => git.resetTo(p, hash, mode))
  handle('action:uncommit', (p) => git.uncommit(p))

  handle('conflict:resolveUsing', (p, file, side) => git.resolveUsing(p, file, side))
  handle('conflict:markResolved', (p, file) => git.markResolved(p, file))
  handle('conflict:abort', (p, kind) => git.abortOperation(p, kind))
  handle('conflict:continue', (p, kind) => git.continueOperation(p, kind))

  handle('repo:clone', (parentDir, url, name) => git.clone(parentDir, url, name))
  handle('config:get', (scope, repoPath) => git.getGitConfig(scope, repoPath))
  handle('config:set', (scope, key, value, repoPath) => git.setGitConfig(scope, key, value, repoPath))
  handle('identity:get', (repoPath) => git.getIdentity(repoPath))
  handle('git:version', () => git.gitVersion())
  handle('creds:store', (info) => git.storeCredential(info))

  handle('dialog:chooseDir', async (title) => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: title || 'Choose a folder',
      buttonLabel: 'Choose',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (res.canceled || !res.filePaths[0]) return null
    return res.filePaths[0]
  })

  handle('sandbox:create', () => git.createSandbox(path.join(app.getPath('documents'), 'GitVista Sandbox')))
  handle('shell:openRepoFile', async (repoPath, file) => {
    const error = await shell.openPath(git.resolveRepoFile(repoPath, file))
    if (error) throw new Error(error)
    return true
  })
  handle('clipboard:writeText', (value) => {
    clipboard.writeText(value)
    return true
  })
  handle('shell:openExternal', (url) => openSecureExternal(url))
  handle('updater:getStatus', () => updaterStatus)
  handle('updater:install', () => {
    if (!appUpdater || updaterStatus.state !== 'ready') throw new Error('An update is not ready to install yet.')
    appUpdater.quitAndInstall(false, true)
    return true
  })
  handle('github:listPullRequests', (p) => github.listPullRequests(p))
  handle('github:listIssues', (p) => github.listIssues(p))
  handle('github:getPullRequest', (p, number) => github.getPullRequest(p, number))
  handle('github:mergePullRequest', (p, number, method, sha) => github.mergePullRequest(p, number, method, sha))
  handle('github:createReview', (p, number, event, body, commitId) =>
    github.createReview(p, number, event, body, commitId)
  )
}

function configureAutoUpdater() {
  try {
    const { autoUpdater } = require('electron-updater')
    appUpdater = autoUpdater
    autoUpdater.on('checking-for-update', () => setUpdaterStatus({ state: 'checking' }))
    autoUpdater.on('update-available', (info) =>
      setUpdaterStatus({ state: 'available', version: info?.version || '' })
    )
    autoUpdater.on('download-progress', (progress) =>
      setUpdaterStatus({ state: 'downloading', percent: Math.round(progress?.percent || 0) })
    )
    autoUpdater.on('update-not-available', () => setUpdaterStatus({ state: 'current' }))
    autoUpdater.on('update-downloaded', (info) =>
      setUpdaterStatus({ state: 'ready', version: info?.version || '' })
    )
    autoUpdater.on('error', (error) =>
      setUpdaterStatus({ state: 'error', message: humanizeError(error?.message || String(error)) })
    )
    autoUpdater.checkForUpdatesAndNotify().catch((error) => {
      setUpdaterStatus({ state: 'error', message: humanizeError(error?.message || String(error)) })
    })
  } catch (error) {
    setUpdaterStatus({ state: 'error', message: humanizeError(error?.message || String(error)) })
  }
}

app.whenReady().then(() => {
  registerIpc()
  createWindow()

  // Unpacked smoke builds and source launches do not contain electron-builder's
  // update metadata. Only initialise the updater in a packaged release that
  // actually has a feed, otherwise a healthy local build reports ENOENT.
  const updateConfig = path.join(process.resourcesPath, 'app-update.yml')
  if (!isDev && app.isPackaged && fs.existsSync(updateConfig)) configureAutoUpdater()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
