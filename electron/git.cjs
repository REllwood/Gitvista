// Git service: a thin, beginner-safe wrapper around the user's installed git,
// driven through simple-git. Everything the renderer needs flows through here.
const { simpleGit } = require('simple-git')
const fs = require('fs')
const fsp = require('fs/promises')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

// Remote operations run with no terminal attached, so make sure git never
// blocks waiting for input it can't get: fail fast instead of hanging. Real
// credentials still come from the OS credential helper / SSH agent.
process.env.GIT_TERMINAL_PROMPT = '0'
if (!process.env.GIT_SSH_COMMAND) process.env.GIT_SSH_COMMAND = 'ssh -o BatchMode=yes'

// Force every editor git might invoke to a no-op that exits 0, so operations
// that would otherwise open an editor (merge/rebase/cherry-pick/revert
// --continue, etc.) accept their prepared message instead of hanging on a TTY
// we don't have. We set these on the inherited environment rather than passing
// `-c core.editor=...`, because simple-git blocks that option as unsafe.
process.env.GIT_EDITOR = 'true'
process.env.GIT_SEQUENCE_EDITOR = 'true'
// File selections are literal paths, never Git patterns or magic pathspecs.
process.env.GIT_LITERAL_PATHSPECS = '1'
// Status reads must not rewrite the index and trigger another watcher refresh.
process.env.GIT_OPTIONAL_LOCKS = '0'

// Unit/record separators — safe field delimiters for parsing `git log` output.
const SEP = '\x1f'
const REC = '\x1e'
const MAX_RENDERED_DIFF_BYTES = 5 * 1024 * 1024
const DIFF_NOTICE_PREFIX = 'GITVISTA_DIFF_NOTICE\n'

// simple-git strips inherited GIT_* variables before it runs git, so the
// hardening above must be allowed through by name. Any other inherited Git
// variable, such as a stray GIT_DIR or GIT_INDEX_FILE, is still removed.
const ALLOWED_GIT_ENVIRONMENT = Object.freeze([
  'GIT_TERMINAL_PROMPT',
  'GIT_SSH_COMMAND',
  'GIT_EDITOR',
  'GIT_SEQUENCE_EDITOR',
  'GIT_LITERAL_PATHSPECS',
  'GIT_OPTIONAL_LOCKS',
])

function createGit(options = {}) {
  return simpleGit({ binary: 'git', ...options, allowEnvironment: ALLOWED_GIT_ENVIRONMENT })
}

function g(repoPath) {
  return createGit({ baseDir: repoPath, maxConcurrentProcesses: 4 })
}

async function getGitDirectory(repoPath) {
  const value = (await g(repoPath).raw(['rev-parse', '--absolute-git-dir'])).trim()
  return fsp.realpath(path.resolve(repoPath, value))
}

async function getGitCommonDirectory(repoPath) {
  const value = (await g(repoPath).raw(['rev-parse', '--git-common-dir'])).trim()
  return fsp.realpath(path.resolve(repoPath, value))
}

function isPathInside(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative !== '' && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
}

// Resolve a renderer-supplied repository file without allowing absolute paths,
// traversal, or a symlinked parent/file to escape the repository. Missing files
// are allowed because a tracked deletion can still be restored from the index.
function resolveRepoFile(repoPath, file) {
  if (typeof repoPath !== 'string' || !repoPath.trim()) throw new Error('A repository path is required.')
  if (typeof file !== 'string' || !file.trim() || file.includes('\0') || path.isAbsolute(file)) {
    throw new Error('That file path is not valid for this repository.')
  }

  const root = fs.realpathSync(path.resolve(repoPath))
  const candidate = path.resolve(root, file)
  if (!isPathInside(root, candidate)) throw new Error('That file path points outside this repository.')

  let existing = candidate
  while (!fs.existsSync(existing) && existing !== root) existing = path.dirname(existing)
  const realExisting = fs.realpathSync(existing)
  if (realExisting !== root && !isPathInside(root, realExisting)) {
    throw new Error('That file path points outside this repository.')
  }

  if (fs.existsSync(candidate)) {
    const realCandidate = fs.realpathSync(candidate)
    if (!isPathInside(root, realCandidate)) throw new Error('That file path points outside this repository.')
  }

  return candidate
}

async function isGitRepo(repoPath) {
  try {
    return !!(await g(repoPath).checkIsRepo())
  } catch {
    return false
  }
}

async function initRepo(repoPath) {
  await g(repoPath).init()
  return true
}

// ---- reading ---------------------------------------------------------------

function parseCommitLog(out) {
  return out
    .split(REC)
    .map((record) => record.replace(/^\s+/, ''))
    .filter(Boolean)
    .map((record) => {
      const [hash, parents, authorName, authorEmail, timestamp, committerName, committerEmail, subject] = record.split(SEP)
      return {
        hash,
        parents: parents ? parents.trim().split(' ').filter(Boolean) : [],
        author: { name: authorName, email: authorEmail },
        committer: { name: committerName, email: committerEmail },
        timestamp: Number.parseInt(timestamp, 10) * 1000,
        subject: subject || '',
        refs: [],
      }
    })
}

async function repositoryHasHead(repoPath) {
  try {
    await g(repoPath).raw(['rev-parse', '--verify', 'HEAD'])
    return true
  } catch (error) {
    const branch = (await g(repoPath).raw(['symbolic-ref', 'HEAD'])).trim()
    const refs = await g(repoPath).raw(['for-each-ref', '--format=%(refname)', branch])
    if (!refs.trim()) return false
    throw error
  }
}

async function getCommits(repoPath, limit = 800) {
  const fields = ['%H', '%P', '%an', '%ae', '%ct', '%cn', '%ce', '%s', '%D']
  const fmt = fields.join(SEP) + REC
  let out
  try {
    out = await g(repoPath).raw([
      'log',
      '--all',
      '--date-order',
      `--max-count=${limit}`,
      `--pretty=format:${fmt}`,
    ])
  } catch {
    // `git log` is expected to fail only for an unborn branch. Do not disguise
    // object corruption or another repository error as an empty history.
    if (!(await repositoryHasHead(repoPath))) return []
    throw new Error('Git could not read this repository’s commit history.')
  }
  return parseCommitLog(out)
}

async function searchHistory(repoPath, query, kind = 'history', limit = 200) {
  const term = (query || '').trim()
  if (!term) return { commits: [], truncated: false }
  const refs = await getRefs(repoPath)
  if (!refs.head && !refs.decorations.length) return { commits: [], truncated: false }
  const fields = ['%H', '%P', '%an', '%ae', '%ct', '%cn', '%ce', '%s', '%D']
  const format = fields.join(SEP) + REC
  const base = ['log', '--all', '--date-order', `--max-count=${limit}`, `--pretty=format:${format}`]
  let outputs = []

  if (kind === 'pickaxe') {
    outputs = [await g(repoPath).raw([...base, '--fixed-strings', '-S', term])]
  } else {
    const escapedAuthor = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    outputs = await Promise.all([
      g(repoPath).raw([...base, '--regexp-ignore-case', '--fixed-strings', '--grep', term]),
      g(repoPath).raw([...base, '--regexp-ignore-case', '--author', escapedAuthor]),
    ])
  }

  const byHash = new Map()
  for (const output of outputs) {
    for (const commit of parseCommitLog(output)) byHash.set(commit.hash, commit)
  }
  const commits = [...byHash.values()].sort((a, b) => b.timestamp - a.timestamp).slice(0, limit)
  return { commits: decorateCommits(commits, refs.decorations), truncated: commits.length >= limit }
}

async function getRefs(repoPath) {
  const git = g(repoPath)
  const [local, remotes, output, hasHead] = await Promise.all([
    git.branchLocal(),
    git.getRemotes(true),
    git.raw(['for-each-ref', `--format=%(refname)${SEP}%(objectname)${SEP}%(*objectname)${SEP}%(upstream:short)${SEP}%(upstream:track,nobracket)${SEP}%(symref)`]),
    repositoryHasHead(repoPath),
  ])
  const head = hasHead ? (await git.revparse(['HEAD'])).trim() : null
  const currentBranch = local.detached ? null : local.current || null
  const localBranches = []
  const remoteBranches = []
  const tags = []
  const decorations = []
  for (const line of output.split('\n').filter(Boolean)) {
    const [ref, hash, peeled, upstream, tracking, symbolic] = line.split(SEP)
    if (ref.startsWith('refs/heads/')) {
      const name = ref.slice('refs/heads/'.length)
      localBranches.push({ name, commit: hash, current: name === currentBranch, upstream: upstream || null,
        upstreamGone: /gone/.test(tracking), ahead: Number(tracking.match(/ahead (\d+)/)?.[1] || 0), behind: Number(tracking.match(/behind (\d+)/)?.[1] || 0) })
      decorations.push({ hash, name, type: name === currentBranch ? 'head' : 'branch' })
    } else if (ref.startsWith('refs/remotes/') && !symbolic) {
      const name = ref.slice('refs/remotes/'.length)
      remoteBranches.push({ name })
      decorations.push({ hash, name, type: 'remote' })
    } else if (ref.startsWith('refs/tags/')) {
      const name = ref.slice('refs/tags/'.length)
      tags.push(name)
      decorations.push({ hash: peeled || hash, name, type: 'tag' })
    }
  }
  if (local.detached && head) decorations.push({ hash: head, name: 'HEAD', type: 'detached' })
  return { currentBranch, detached: !!local.detached, head, localBranches, remoteBranches, tags, decorations,
    remotes: remotes.map((remote) => ({ name: remote.name, url: remote.refs.fetch || remote.refs.push || '' })) }
}

function decorateCommits(commits, decorations) {
  const byHash = new Map()
  for (const { hash, ...ref } of decorations) {
    if (!byHash.has(hash)) byHash.set(hash, [])
    byHash.get(hash).push(ref)
  }
  return commits.map((commit) => ({ ...commit, refs: byHash.get(commit.hash) || [] }))
}

function codeToStatus(code) {
  switch (code) {
    case 'M':
      return 'modified'
    case 'A':
      return 'added'
    case 'D':
      return 'deleted'
    case 'R':
      return 'renamed'
    case 'C':
      return 'copied'
    case 'T':
      return 'typechange'
    default:
      return 'modified'
  }
}

function emptyStatus() {
  return {
    staged: [],
    unstaged: [],
    untracked: [],
    current: null,
    tracking: null,
    ahead: 0,
    behind: 0,
    clean: true,
  }
}

async function getStatus(repoPath) {
  const s = await g(repoPath).status()
  const conflicted = new Set(s.conflicted || [])
  const staged = []
  const unstaged = []
  const untracked = []

  for (const f of s.files) {
    const x = f.index // staged column
    const y = f.working_dir // worktree column
    if (conflicted.has(f.path) || x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D')) {
      unstaged.push({ path: f.path, status: 'conflicted' })
      continue
    }
    if (x === '?' && y === '?') {
      untracked.push({ path: f.path, status: 'untracked' })
      continue
    }
    if (x && x !== ' ' && x !== '?') staged.push({ path: f.path, status: codeToStatus(x), ...(f.from ? { previousPath: f.from } : {}) })
    if (y && y !== ' ' && y !== '?') unstaged.push({ path: f.path, status: codeToStatus(y) })
  }

  return {
    staged,
    unstaged,
    untracked,
    current: s.current,
    tracking: s.tracking,
    ahead: s.ahead,
    behind: s.behind,
    clean: staged.length === 0 && unstaged.length === 0 && untracked.length === 0,
  }
}

async function getStashes(repoPath) {
  const out = await g(repoPath).stashList()
  return (out.all || []).map((stash, index) => ({ index, message: stash.message || '', hash: stash.hash || '' }))
}

async function getRepoData(repoPath) {
  repoPath = await fsp.realpath((await g(repoPath).raw(['rev-parse', '--show-toplevel'])).trim())
  const refs = await getRefs(repoPath)
  const [commits, status, stashes, worktrees, gitDir] = await Promise.all([
    getCommits(repoPath),
    getStatus(repoPath),
    getStashes(repoPath),
    getWorktrees(repoPath),
    getGitDirectory(repoPath),
  ])
  const conflict = getConflictState(gitDir, status)
  const { decorations, ...repositoryRefs } = refs
  return { ...repositoryRefs, currentBranch: refs.currentBranch || (!refs.detached ? status.current : null), commits: decorateCommits(commits, decorations), status, stashes, worktrees, conflict, path: repoPath, name: path.basename(repoPath) }
}

// Detects an interrupted operation (merge / rebase / cherry-pick) by looking
// for the marker files Git leaves in .git, plus the list of conflicted files.
function getConflictState(gitDir, status) {
  const exists = (p) => {
    try {
      return fs.existsSync(path.join(gitDir, p))
    } catch {
      return false
    }
  }
  let inProgress = null
  if (exists('MERGE_HEAD')) inProgress = 'merge'
  else if (exists('rebase-merge') || exists('rebase-apply')) inProgress = 'rebase'
  else if (exists('CHERRY_PICK_HEAD')) inProgress = 'cherry-pick'
  else if (exists('REVERT_HEAD')) inProgress = 'revert'

  const conflictedFiles = (status?.unstaged || []).filter((f) => f.status === 'conflicted').map((f) => f.path)
  return { inProgress, conflictedFiles }
}

async function getCommitFiles(repoPath, hash) {
  const git = g(repoPath)
  const [out, bodyOutput, signatureOutput] = await Promise.all([
    git.raw(['show', '--diff-merges=first-parent', '--numstat', '-z', '--format=', hash, '--']),
    git.raw(['show', '-s', '--format=%B', hash]),
    git.raw(['show', '-s', `--format=%G?${SEP}%GS${SEP}%GK${SEP}%GT`, hash]),
  ])
  const files = parseNumstat(out)
  const [status = 'N', signer = '', key = '', trust = ''] = signatureOutput.trim().split(SEP)
  return {
    files,
    body: bodyOutput.trim(),
    signature: { status, signer, key, trust },
  }
}

async function getFileDiff(repoPath, file, staged) {
  const git = g(repoPath)
  const resolvedFile = resolveRepoFile(repoPath, file)
  const rename = staged ? (await getStatus(repoPath)).staged.find((entry) => entry.path === file)?.previousPath : null
  const args = [...(staged ? ['--cached'] : []), '--no-ext-diff', '--no-textconv', '--no-color', '--find-renames', '--', ...(rename ? [rename, file] : [file])]
  let out = await git.diff(args)
  if (Buffer.byteLength(out, 'utf8') > MAX_RENDERED_DIFF_BYTES) {
    return `${DIFF_NOTICE_PREFIX}This comparison is larger than 5 MB. Open the file in your editor to review it without slowing GitVista.`
  }
  if (!out && !staged) {
    if ((await git.raw(['ls-files', '-z', '--', file])).length) return ''
    // Git does not include untracked files in `git diff`. Build a display-only
    // unified diff, while bounding work so a large or binary file cannot stall
    // the renderer. The UI deliberately disables hunk staging for this view.
    try {
      const stat = await fsp.stat(resolvedFile)
      if (!stat.isFile()) return `${DIFF_NOTICE_PREFIX}This item is not a regular file and cannot be previewed.`
      if (stat.size > MAX_RENDERED_DIFF_BYTES) {
        return `${DIFF_NOTICE_PREFIX}This untracked file is larger than 5 MB. Open it in your editor to review it without slowing GitVista.`
      }
      const buffer = await fsp.readFile(resolvedFile)
      if (buffer.subarray(0, 8192).includes(0)) {
        return `${DIFF_NOTICE_PREFIX}This untracked file appears to be binary, so a text comparison is not available.`
      }
      const content = buffer.toString('utf8')
      if (!content) return ''
      const hasFinalNewline = content.endsWith('\n')
      const lines = (hasFinalNewline ? content.slice(0, -1) : content).split('\n')
      const quoted = file.replace(/"/g, '\\"')
      out = [
        `diff --git "a/${quoted}" "b/${quoted}"`,
        'new file mode 100644',
        '--- /dev/null',
        `+++ "b/${quoted}"`,
        `@@ -0,0 +1,${lines.length} @@`,
        ...lines.map((line) => `+${line}`),
        ...(!hasFinalNewline ? ['\\ No newline at end of file'] : []),
      ].join('\n')
    } catch (error) {
      if (error && !['ENOENT', 'EISDIR'].includes(error.code)) throw error
    }
  }
  return out
}

// ---- mutating --------------------------------------------------------------

async function stageFile(repoPath, file) {
  await g(repoPath).raw(['add', '--', file])
  return true
}

async function unstageFile(repoPath, file) {
  const git = g(repoPath)
  const rename = (await getStatus(repoPath)).staged.find((entry) => entry.path === file)?.previousPath
  await git.raw(['reset', '-q', 'HEAD', '--', ...(rename ? [rename, file] : [file])])
  return true
}

async function stageAll(repoPath) {
  await g(repoPath).add(['-A'])
  return true
}

async function unstageAll(repoPath) {
  await g(repoPath).raw(['reset', '-q', 'HEAD', '--'])
  return true
}

// ---- partial (hunk) staging ------------------------------------------------

// Applies a single-hunk patch to the index. With reverse=false it stages a
// working-tree hunk (patch built from `git diff`); with reverse=true it unstages
// a hunk (patch built from `git diff --cached`, reverse-applied). This is what
// `git add -p` / `git reset -p` do under the hood.
async function applyHunkPatch(repoPath, patch, reverse) {
  const input = patch.endsWith('\n') ? patch : patch + '\n'
  await new Promise((resolve, reject) => {
    const args = ['apply', '--cached', '--recount', '--whitespace=nowarn']
    if (reverse) args.push('--reverse')
    const child = spawn('git', args, { cwd: repoPath, env: process.env, stdio: ['pipe', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => (stderr += chunk.toString()))
    child.stdin.on('error', (error) => {
      if (error?.code !== 'EPIPE') reject(error)
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `git apply exited with code ${code}`))
    })
    child.stdin.end(input)
  })
  return true
}

async function stageHunk(repoPath, patch) {
  return applyHunkPatch(repoPath, patch, false)
}

async function unstageHunk(repoPath, patch) {
  return applyHunkPatch(repoPath, patch, true)
}

async function discardFile(repoPath, file) {
  const git = g(repoPath)
  const resolvedFile = resolveRepoFile(repoPath, file)
  const status = await git.raw(['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', file])
  const untracked = status.split('\0').some((entry) => entry.startsWith('?? '))

  if (!untracked) {
    await git.checkout(['--', file])
    return true
  }

  const entry = await fsp.lstat(resolvedFile)
  if (!entry.isFile() && !entry.isSymbolicLink()) {
    throw new Error('GitVista will only discard individual untracked files. Remove this folder manually after reviewing it.')
  }
  await fsp.unlink(resolvedFile)
  return true
}

async function commit(repoPath, message) {
  const res = await g(repoPath).commit(message)
  return res
}

// Replace the most recent commit with one that includes whatever is currently
// staged and (optionally) a new message. Rewrites that commit's id.
async function amendCommit(repoPath, message) {
  const git = g(repoPath)
  if (message && message.trim()) await git.raw(['commit', '--amend', '-m', message.trim()])
  else await git.raw(['commit', '--amend', '--no-edit'])
  return true
}

async function createBranch(repoPath, name, checkout = true) {
  const git = g(repoPath)
  if (checkout) await git.checkoutLocalBranch(name)
  else await git.branch([name])
  return true
}

async function checkout(repoPath, ref) {
  await g(repoPath).checkout(ref)
  return true
}

// Check out a remote branch (e.g. "origin/feature") by creating a local branch
// of the same short name that tracks it — or just switching if it already
// exists. Returns the local branch name.
async function checkoutRemote(repoPath, remoteBranch) {
  const git = g(repoPath)
  const remote = (await git.getRemotes(false))
    .map((entry) => entry.name)
    .sort((a, b) => b.length - a.length)
    .find((name) => remoteBranch.startsWith(`${name}/`))
  if (!remote) throw new Error('That remote branch does not match a configured remote.')
  await git.raw(['show-ref', '--verify', `refs/remotes/${remoteBranch}`])
  const local = remoteBranch.slice(remote.length + 1)
  let exists = false
  try {
    exists = (await git.branchLocal()).all.includes(local)
  } catch {
    /* unborn / no branches */
  }
  if (exists) {
    const upstream = (await git.raw(['for-each-ref', '--format=%(upstream:short)', `refs/heads/${local}`])).trim()
    if (upstream && upstream !== remoteBranch) {
      throw new Error(`A local branch named “${local}” already tracks “${upstream}”. Choose it directly or rename it first.`)
    }
    await git.checkout(local)
    if (!upstream) await git.raw(['branch', '--set-upstream-to', remoteBranch, local])
  } else {
    await git.raw(['checkout', '-b', local, '--track', remoteBranch])
  }
  return local
}

async function renameBranch(repoPath, oldName, newName) {
  await g(repoPath).raw(['branch', '-m', oldName, newName])
  return true
}

// Force-move a branch label to point at another commit. Git refuses to do this
// to the checked-out branch (use reset for that), so this is only for other
// branches — handy for dragging a branch onto a commit in the graph.
async function moveBranch(repoPath, name, target) {
  await g(repoPath).raw(['branch', '-f', name, target])
  return true
}

async function merge(repoPath, branch) {
  return g(repoPath).merge([branch])
}

async function fetch(repoPath) {
  return g(repoPath).fetch(['--all', '--prune'])
}

async function pull(repoPath) {
  return g(repoPath).pull()
}

// The remote a push should target when the branch has no upstream yet: prefer
// "origin", otherwise the only/first remote. Throws a friendly error if none.
async function defaultRemote(git) {
  let remotes = []
  try {
    remotes = await git.getRemotes(false)
  } catch {
    remotes = []
  }
  if (!remotes.length) {
    throw new Error('This repository has no remote yet. Add a remote (for example on GitHub) before pushing.')
  }
  return (remotes.find((r) => r.name === 'origin') || remotes[0]).name
}

async function push(repoPath) {
  const git = g(repoPath)
  const status = await git.status()
  if (!status.current) throw new Error('Nothing to push — you are not on a branch.')
  if (!status.tracking) {
    // First push of a new branch: set the upstream so future pushes are simple.
    const remote = await defaultRemote(git)
    await git.push(['-u', remote, status.current])
  } else {
    await git.push()
  }
  return true
}

// Overwrites the remote branch with your local history. Uses --force-with-lease,
// which refuses to push if the remote moved since your last fetch (so you can't
// silently clobber a teammate's commits). Surfaced only behind an explicit,
// clearly-warned confirmation in the UI.
async function forcePush(repoPath) {
  const git = g(repoPath)
  const status = await git.status()
  if (!status.current) throw new Error('Nothing to push — you are not on a branch.')
  if (!status.tracking) {
    const remote = await defaultRemote(git)
    await git.push(['--force-with-lease', '-u', remote, status.current])
  } else {
    await git.push(['--force-with-lease'])
  }
  return true
}

async function remoteByName(git, preferred) {
  const remotes = await git.getRemotes(false)
  if (!remotes.length) throw new Error('This repository has no remote.')
  if (!preferred) return (remotes.find((remote) => remote.name === 'origin') || remotes[0]).name
  if (!remotes.some((remote) => remote.name === preferred)) throw new Error(`Remote “${preferred}” does not exist.`)
  return preferred
}

async function validateFullRef(git, fullRef) {
  await git.raw(['check-ref-format', fullRef])
}

async function pushTag(repoPath, tag, remoteName) {
  const git = g(repoPath)
  const remote = await remoteByName(git, remoteName)
  const fullRef = `refs/tags/${tag}`
  await validateFullRef(git, fullRef)
  await git.push([remote, `${fullRef}:${fullRef}`])
  return true
}

async function deleteRemoteTag(repoPath, tag, remoteName) {
  const git = g(repoPath)
  const remote = await remoteByName(git, remoteName)
  const fullRef = `refs/tags/${tag}`
  await validateFullRef(git, fullRef)
  await git.push([remote, `:${fullRef}`])
  return true
}

async function deleteRemoteBranch(repoPath, remoteBranch) {
  const git = g(repoPath)
  const remotes = await git.getRemotes(false)
  const match = remotes
    .map((remote) => remote.name)
    .sort((a, b) => b.length - a.length)
    .find((name) => remoteBranch.startsWith(`${name}/`))
  if (!match) throw new Error('That remote branch does not match a configured remote.')
  const branch = remoteBranch.slice(match.length + 1)
  const fullRef = `refs/heads/${branch}`
  await validateFullRef(git, fullRef)
  await git.push([match, `:${fullRef}`])
  return true
}

async function stash(repoPath, message, includeUntracked) {
  const args = ['push']
  if (includeUntracked) args.push('--include-untracked')
  if (message && message.trim()) args.push('-m', message.trim())
  await g(repoPath).stash(args)
  return true
}

async function stashPop(repoPath, index = 0) {
  await g(repoPath).stash(['pop', `stash@{${index}}`])
  return true
}

// Apply a stash but keep it in the list (unlike pop, which removes it).
async function stashApply(repoPath, index = 0) {
  await g(repoPath).stash(['apply', `stash@{${index}}`])
  return true
}

async function stashDrop(repoPath, index = 0) {
  await g(repoPath).stash(['drop', `stash@{${index}}`])
  return true
}

async function deleteBranch(repoPath, name) {
  await g(repoPath).deleteLocalBranch(name, false)
  return true
}

// ---- diffs & file contents -------------------------------------------------

async function getCommitFileDiff(repoPath, hash, file, previousPath) {
  resolveRepoFile(repoPath, file)
  if (previousPath) resolveRepoFile(repoPath, previousPath)
  const paths = previousPath ? [previousPath, file] : [file]
  const out = await g(repoPath).raw(['show', '--diff-merges=first-parent', '--format=', '--no-color', '--no-ext-diff', '--no-textconv', '--find-renames', hash, '--', ...paths])
  if (Buffer.byteLength(out, 'utf8') > MAX_RENDERED_DIFF_BYTES) {
    return `${DIFF_NOTICE_PREFIX}This comparison is larger than 5 MB. Open the file in your editor to review it without slowing GitVista.`
  }
  return out
}

async function getFileContent(repoPath, file) {
  const resolvedFile = resolveRepoFile(repoPath, file)
  const stat = await fsp.stat(resolvedFile)
  if (!stat.isFile()) return `${DIFF_NOTICE_PREFIX}This item is not a regular file and cannot be previewed.`
  if (stat.size > MAX_RENDERED_DIFF_BYTES) {
    return `${DIFF_NOTICE_PREFIX}This file is larger than 5 MB. Open it in your editor to resolve the conflict without slowing GitVista.`
  }
  const content = await fsp.readFile(resolvedFile)
  if (content.includes(0)) {
    return `${DIFF_NOTICE_PREFIX}This file appears to be binary, so GitVista cannot provide a text conflict view.`
  }
  return content.toString('utf8')
}

// Commit history for one path, following renames. An optional ref lets the UI
// inspect history as it existed at an older commit rather than always at HEAD.
async function getFileHistory(repoPath, file, ref) {
  resolveRepoFile(repoPath, file)
  const args = [
    'log',
    '--follow',
    '--find-renames',
    '--name-status',
    '-z',
    '--no-color',
    '--max-count=300',
    `--format=${REC}%H${SEP}%an${SEP}%ae${SEP}%ct${SEP}%s${SEP}`,
  ]
  if (ref) args.push(ref)
  args.push('--', file)
  const out = await g(repoPath).raw(args)
  return out.split(REC).filter(Boolean).map((record) => {
      const metadataEnd = record.indexOf('\0')
      const metadata = metadataEnd === -1 ? record : record.slice(0, metadataEnd)
      const changes = metadataEnd === -1
        ? []
        : record.slice(metadataEnd + 1).replace(/^\n/, '').split('\0').filter(Boolean)
      const [hash, authorName, authorEmail, timestamp, subject] = metadata.split(SEP)
      const changeType = changes[0] || ''
      const renamed = /^[RC]\d*/.test(changeType)
      const previousPath = renamed ? changes[1] || null : null
      const changedPath = renamed ? changes[2] || file : changes[1] || file
      return {
        hash,
        author: { name: authorName || '', email: authorEmail || '' },
        timestamp: Number.parseInt(timestamp, 10) * 1000,
        subject: subject || '',
        path: changedPath,
        previousPath,
      }
    })
}

// Porcelain blame is stable and machine-readable. Limit the initial view so a
// single generated file cannot flood the renderer; the UI clearly marks a
// capped result. Passing a ref blames that historical version of the file.
async function getFileBlame(repoPath, file, ref) {
  resolveRepoFile(repoPath, file)
  const args = ['blame', '--line-porcelain', '-L', '1,5000']
  if (ref) args.push(ref)
  args.push('--', file)
  const out = await g(repoPath).raw(args)
  const lines = []
  let current = null

  for (const line of out.split('\n')) {
    const header = line.match(/^([0-9a-f^]{40,64})\s+(\d+)\s+(\d+)(?:\s+\d+)?$/i)
    if (header) {
      current = {
        hash: header[1].replace(/^\^/, ''),
        originalLine: Number.parseInt(header[2], 10),
        line: Number.parseInt(header[3], 10),
        author: { name: '', email: '' },
        timestamp: 0,
        subject: '',
      }
      continue
    }
    if (!current) continue
    if (line.startsWith('author ')) current.author.name = line.slice(7)
    else if (line.startsWith('author-mail ')) current.author.email = line.slice(12).replace(/^<|>$/g, '')
    else if (line.startsWith('author-time ')) current.timestamp = Number.parseInt(line.slice(12), 10) * 1000
    else if (line.startsWith('summary ')) current.subject = line.slice(8)
    else if (line.startsWith('\t')) {
      lines.push({ ...current, content: line.slice(1), uncommitted: /^0+$/.test(current.hash) })
      current = null
    }
  }

  return { lines, truncated: lines.length >= 5000 }
}

// Files changed going from ref A to ref B (commits, branches, tags — anything
// git can resolve). Returns the same shape as getCommitFiles' file list.
function parseNumstat(output) {
  const records = output.split('\0')
  const files = []
  for (let index = 0; index < records.length;) {
    const record = records[index++]
    if (!record) continue
    const parts = record.replace(/^\n+/, '').split('\t')
    if (parts.length < 3) continue
    const [adds, dels] = parts
    let file = parts.slice(2).join('\t')
    let previousPath = null
    if (!file) {
      previousPath = records[index++] || null
      file = records[index++] || ''
    }
    if (!file) continue
    files.push({
      path: file,
      previousPath,
      additions: adds === '-' ? null : Number.parseInt(adds, 10),
      deletions: dels === '-' ? null : Number.parseInt(dels, 10),
    })
  }
  return files
}

async function getChangedBetween(repoPath, a, b) {
  const out = await g(repoPath).raw(['diff', '--numstat', '-z', '--no-color', '--find-renames', a, b, '--'])
  return parseNumstat(out)
}

async function getDiffBetween(repoPath, a, b, file, previousPath) {
  if (file) resolveRepoFile(repoPath, file)
  if (previousPath) resolveRepoFile(repoPath, previousPath)
  const args = ['diff', '--no-color', '--no-ext-diff', '--no-textconv', '--find-renames', a, b, '--']
  if (file) args.push(...(previousPath ? [previousPath, file] : [file]))
  const out = await g(repoPath).raw(args)
  if (Buffer.byteLength(out, 'utf8') > MAX_RENDERED_DIFF_BYTES) {
    return `${DIFF_NOTICE_PREFIX}This comparison is larger than 5 MB. Open the file in your editor to review it without slowing GitVista.`
  }
  return out
}

// ---- history-changing actions ----------------------------------------------

async function cherryPick(repoPath, hash) {
  await g(repoPath).raw(['cherry-pick', hash])
  return true
}

async function revertCommit(repoPath, hash) {
  await g(repoPath).raw(['revert', '--no-edit', hash])
  return true
}

async function rebase(repoPath, onto) {
  await g(repoPath).raw(['rebase', onto])
  return true
}

// Reword messages are keyed by original commit, not editor-call order. Git
// can invoke its editor an extra time when a conflict is continued.
async function runRebaseWithEditor(repoPath, args, planDir, gitDir) {
  const realPlan = await fsp.realpath(planDir)
  const helper = path.join(realPlan, 'rebase-editor.cjs')
  await fsp.copyFile(path.join(__dirname, 'rebase-editor.cjs'), helper)
  const editor = `"${process.execPath}" "${helper}"`
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1', GIT_EDITOR: editor, GIT_SEQUENCE_EDITOR: editor,
    GV_TODO_FILE: path.join(realPlan, 'todo'), GV_MESSAGES: path.join(realPlan, 'messages.json'),
    GV_REBASE_DONE: path.join(gitDir, 'rebase-merge', 'done') }
  await new Promise((resolve, reject) => {
    const child = spawn('git', args, { cwd: repoPath, env, stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += chunk.toString() })
    child.on('error', reject)
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(stderr.trim() || `Git rebase exited with code ${code}`)))
  })
  return true
}

async function interactiveRebase(repoPath, base, todo) {
  if (!Array.isArray(todo) || !todo.length) throw new Error('Nothing to rebase.')
  const kept = todo.filter((step) => step.action !== 'drop')
  if (!kept.length) throw new Error('At least one commit must be kept.')
  if (!['pick', 'reword'].includes(kept[0].action)) throw new Error('The first kept commit must be picked or reworded.')
  const gitDir = await getGitDirectory(repoPath)
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'gv-irebase-'))
  try {
    await fsp.writeFile(path.join(dir, 'todo'), kept.map((step) => `${step.action} ${step.hash}`).join('\n') + '\n')
    await fsp.writeFile(path.join(dir, 'messages.json'), JSON.stringify(Object.fromEntries(
      kept.filter((step) => step.action === 'reword').map((step) => [step.hash, step.message])
    )))
    return await runRebaseWithEditor(repoPath, ['rebase', '-i', base], dir, gitDir)
  } catch (error) {
    const rebaseDir = path.join(gitDir, 'rebase-merge')
    if (fs.existsSync(rebaseDir)) {
      // Git owns this operation directory and removes it on finish/abort. Keep
      // the plan here so it survives both a pause and an application restart.
      await fsp.cp(dir, path.join(rebaseDir, 'gitvista-editor'), { recursive: true })
    }
    throw error
  } finally {
    // This is the same temporary editor cleanup used by the original service.
    await fsp.rm(dir, { recursive: true, force: true })
  }
}

async function createTag(repoPath, name, hash) {
  const args = ['tag', name]
  if (hash) args.push(hash)
  await g(repoPath).raw(args)
  return true
}

async function deleteTag(repoPath, name) {
  await g(repoPath).raw(['tag', '-d', name])
  return true
}

async function createBranchAt(repoPath, name, hash, checkout = true) {
  const git = g(repoPath)
  if (checkout) await git.raw(['checkout', '-b', name, hash])
  else await git.raw(['branch', name, hash])
  return true
}

async function resetTo(repoPath, hash, mode = 'mixed') {
  const flag = mode === 'hard' ? '--hard' : mode === 'soft' ? '--soft' : '--mixed'
  await g(repoPath).raw(['reset', flag, hash])
  return true
}

async function uncommit(repoPath) {
  // Undo the most recent commit but keep its changes staged.
  await g(repoPath).raw(['reset', '--soft', 'HEAD~1'])
  return true
}

// ---- conflict resolution ---------------------------------------------------

async function resolveUsing(repoPath, file, side) {
  // The UI's "Keep current" calls this with side='ours' (the user's own branch
  // work); "Keep incoming" with side='theirs'. During a MERGE / cherry-pick /
  // revert, git's --ours IS the current branch, so the mapping is direct.
  // During a REBASE git swaps the meaning (--ours = the branch you're replaying
  // ONTO, --theirs = your commits being replayed), so we flip it to preserve the
  // user's intent and avoid silently discarding their work.
  const gitDir = await getGitDirectory(repoPath)
  const rebasing = fs.existsSync(path.join(gitDir, 'rebase-merge')) || fs.existsSync(path.join(gitDir, 'rebase-apply'))
  const wantsOurs = side !== 'theirs'
  const useOurs = rebasing ? !wantsOurs : wantsOurs
  const git = g(repoPath)
  await git.raw(['checkout', useOurs ? '--ours' : '--theirs', '--', file])
  await git.raw(['add', '--', file])
  return true
}

async function markResolved(repoPath, file) {
  const content = await getFileContent(repoPath, file)
  if (/^<{7,}(?: |$)[\s\S]*?^={7,}\r?$[\s\S]*?^>{7,}(?: |$)/m.test(content)) {
    throw new Error('This file still contains conflict markers. Resolve each conflict before marking it resolved.')
  }
  if (content.startsWith(DIFF_NOTICE_PREFIX)) throw new Error(content.slice(DIFF_NOTICE_PREFIX.length))
  await g(repoPath).raw(['add', '--', file])
  return true
}

async function abortOperation(repoPath, kind) {
  const git = g(repoPath)
  if (kind === 'merge') await git.raw(['merge', '--abort'])
  else if (kind === 'rebase') await git.raw(['rebase', '--abort'])
  else if (kind === 'cherry-pick') await git.raw(['cherry-pick', '--abort'])
  else if (kind === 'revert') await git.raw(['revert', '--abort'])
  return true
}

async function continueOperation(repoPath, kind) {
  const git = g(repoPath)
  if (kind === 'merge') {
    // Finishing a merge is just committing the resolved index — no editor needed.
    await git.raw(['commit', '--no-edit'])
    return true
  }
  // --continue would normally open an editor to confirm the message; the
  // GIT_EDITOR/GIT_SEQUENCE_EDITOR no-ops set at module load make it accept the
  // prepared message non-interactively. (We can't use `-c core.editor=...` here
  // because simple-git rejects it as an unsafe option.)
  if (kind === 'rebase') {
    const gitDir = await getGitDirectory(repoPath)
    const planDir = path.join(gitDir, 'rebase-merge', 'gitvista-editor')
    if (fs.existsSync(planDir)) {
      if (!isPathInside(gitDir, await fsp.realpath(planDir))) throw new Error('The saved rebase plan points outside the Git directory.')
      return runRebaseWithEditor(repoPath, ['rebase', '--continue'], planDir, gitDir)
    }
    await git.raw(['rebase', '--continue'])
  }
  else if (kind === 'cherry-pick') await git.raw(['cherry-pick', '--continue'])
  else if (kind === 'revert') await git.raw(['revert', '--continue'])
  return true
}

// ---- remotes & upstream ----------------------------------------------------

async function addRemote(repoPath, name, url) {
  if (!name || !name.trim() || !url || !url.trim()) throw new Error('A remote needs both a name and a URL.')
  if (name.trim().startsWith('-')) throw new Error('A remote name cannot begin with a dash.')
  if (url.trim().startsWith('-')) throw new Error('A remote URL cannot begin with a dash.')
  await g(repoPath).raw(['remote', 'add', name.trim(), url.trim()])
  return true
}

async function removeRemote(repoPath, name) {
  await g(repoPath).raw(['remote', 'remove', name])
  return true
}

async function renameRemote(repoPath, oldName, newName) {
  await g(repoPath).raw(['remote', 'rename', oldName, newName])
  return true
}

// Point a local branch at a remote branch (e.g. upstream = "origin/main").
async function setUpstream(repoPath, branch, upstream) {
  await g(repoPath).raw(['branch', `--set-upstream-to=${upstream}`, branch])
  return true
}

async function unsetUpstream(repoPath, branch) {
  await g(repoPath).raw(['branch', '--unset-upstream', branch])
  return true
}

// ---- worktrees -------------------------------------------------------------

async function getWorktrees(repoPath) {
  const out = await g(repoPath).raw(['worktree', 'list', '--porcelain', '-z'])
  const records = []
  let current = null
  const flush = () => {
    if (current?.path) records.push(current)
    current = null
  }

  for (const field of out.split('\0')) {
    if (!field) {
      flush()
      continue
    }
    if (field.startsWith('worktree ')) {
      flush()
      current = { path: field.slice(9), head: null, branch: null, detached: false, locked: false, prunable: false }
    } else if (current && field.startsWith('HEAD ')) current.head = field.slice(5)
    else if (current && field.startsWith('branch ')) current.branch = field.slice(7).replace(/^refs\/heads\//, '')
    else if (current && field === 'detached') current.detached = true
    else if (current && field.startsWith('locked')) current.locked = field.slice(6).trim() || true
    else if (current && field.startsWith('prunable')) current.prunable = field.slice(8).trim() || true
  }
  flush()

  let currentRoot = path.resolve(repoPath)
  try {
    currentRoot = await fsp.realpath(repoPath)
  } catch {
    /* retain resolved path */
  }
  return records.map((worktree, index) => ({
    ...worktree,
    main: index === 0,
    current: path.resolve(worktree.path) === currentRoot,
  }))
}

async function addWorktree(repoPath, parentDir, folderName, ref, newBranch) {
  if (!folderName || folderName === '.' || folderName === '..' || /[\\/\0]/.test(folderName)) {
    throw new Error('Choose a single folder name for the worktree.')
  }
  const parent = await fsp.realpath(parentDir)
  const target = path.resolve(parent, folderName)
  if (!isPathInside(parent, target)) throw new Error('The worktree folder must stay inside the selected parent folder.')
  try {
    await fsp.lstat(target)
    throw new Error(`A folder named “${folderName}” already exists. Choose a new folder name.`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }

  const args = ['worktree', 'add']
  if (newBranch) args.push('-b', newBranch)
  args.push(target, ref || 'HEAD')
  await g(repoPath).raw(args)
  return target
}

// ---- reflog ----------------------------------------------------------------

// The reflog is Git's safety net: every move of HEAD (commit, reset, rebase,
// checkout, merge…) is recorded, so lost commits/branches can be recovered.
async function getReflog(repoPath, limit = 200) {
  try {
    const out = await g(repoPath).raw([
      'reflog',
      '--no-color',
      '--date=raw',
      `--max-count=${limit}`,
      `--format=%H${SEP}%gD${SEP}%gs`,
    ])
    return out
      .split('\n')
      .map((l) => l.replace(/^\s+/, ''))
      .filter(Boolean)
      .map((line, index) => {
        const [hash, datedSelector, gs] = line.split(SEP)
        // %gs is like "commit: msg", "reset: moving to X", "rebase (finish): ..."
        const m = (gs || '').match(/^([^:]+):\s*(.*)$/)
        return {
          hash,
          selector: `HEAD@{${index}}`,
          action: m ? m[1] : gs || '',
          subject: m ? m[2] : gs || '',
          timestamp: Number(datedSelector.match(/@\{(\d+)/)?.[1] || 0) * 1000,
        }
      })
  } catch {
    return []
  }
}

// Computes how to undo the most recent history operation, accounting for its
// type so the one-click "Undo" is always correct:
//   • a branch switch is undone by switching back — a reset would move the
//     branch you just switched TO, losing its work;
//   • a rebase is undone via ORIG_HEAD, because its HEAD@{1} is mid-operation;
//   • everything else (commit/amend/reset/merge/cherry-pick/revert) returns to
//     the prior HEAD position (HEAD@{1}).
// Returns { kind:'checkout', ref } | { kind:'restore', hash, label } | null.
async function getUndoTarget(repoPath) {
  const git = g(repoPath)
  let lines = []
  try {
    const out = await git.raw(['reflog', `--format=%gs${SEP}%H`, '-n', '5'])
    lines = out
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        const [subject, hash] = l.split(SEP)
        return { subject: subject || '', hash: hash || '', action: (subject || '').split(':')[0].trim() }
      })
  } catch {
    return null
  }
  if (!lines.length) return null
  const last = lines[0]

  if (/^checkout$/i.test(last.action)) {
    const m = last.subject.match(/moving from (\S+) to /)
    if (m) return { kind: 'checkout', ref: m[1], label: m[1] }
  }
  if (/^rebase/i.test(last.action)) {
    try {
      const orig = (await git.raw(['rev-parse', 'ORIG_HEAD'])).trim()
      if (orig) return { kind: 'restore', hash: orig, label: orig.slice(0, 7) }
    } catch {
      /* no ORIG_HEAD — fall through */
    }
  }
  const prev = lines[1]
  if (prev && prev.hash) return { kind: 'restore', hash: prev.hash, label: prev.subject || prev.hash.slice(0, 7) }
  return null
}

// ---- clone -----------------------------------------------------------------

function deriveRepoName(url) {
  const m = (url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .match(/([^/:]+)$/)
  return m ? m[1] : 'repository'
}

async function clone(parentDir, url, name) {
  const target = (name && name.trim()) || deriveRepoName(url)
  if (!target || target === '.' || target === '..' || /[\\/\0]/.test(target)) {
    throw new Error('Choose a single folder name for the cloned repository.')
  }
  if (!url || !url.trim() || url.trim().startsWith('-')) throw new Error('Enter a valid repository URL.')
  const parent = await fsp.realpath(parentDir)
  const dest = path.resolve(parent, target)
  if (!isPathInside(parent, dest)) throw new Error('The cloned repository must stay inside the selected parent folder.')
  try {
    await fsp.lstat(dest)
    throw new Error(`A folder named "${target}" already exists here. Choose another folder name.`)
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  await createGit({ baseDir: parent, maxConcurrentProcesses: 1 }).clone(url.trim(), target)
  return dest
}

// ---- configuration & identity ----------------------------------------------

async function getGitConfig(scope = 'global', repoPath) {
  if (!['global', 'local'].includes(scope)) throw new Error('Configuration scope must be global or local.')
  if (scope === 'local' && !repoPath) throw new Error('A repository is required for local Git settings.')
  const git = scope === 'local' && repoPath ? g(repoPath) : createGit()
  const scopeArgs = scope === 'local' ? ['--local'] : ['--global']
  const read = async (key, args) => {
    try {
      return (await git.raw(['config', ...args, key])).trim()
    } catch {
      return ''
    }
  }
  const pullRebase = await read('pull.rebase', scopeArgs)
  const signCommits = await read('commit.gpgsign', scopeArgs)
  const signingFormat = await read('gpg.format', scopeArgs)
  return {
    name: await read('user.name', scopeArgs),
    email: await read('user.email', scopeArgs),
    pullRebase: scope === 'local' && !pullRebase ? null : pullRebase === 'true',
    signCommits: scope === 'local' && !signCommits ? null : signCommits === 'true',
    signingKey: await read('user.signingkey', scopeArgs),
    signingFormat: signingFormat || (scope === 'local' ? '' : 'openpgp'),
    credentialHelper: await read('credential.helper', ['--global']),
  }
}

async function setGitConfig(scope, key, value, repoPath) {
  if (!['global', 'local'].includes(scope)) throw new Error('Configuration scope must be global or local.')
  if (scope === 'local' && !repoPath) throw new Error('A repository is required for local Git settings.')
  if (!['user.name', 'user.email', 'pull.rebase', 'commit.gpgsign', 'user.signingkey', 'gpg.format'].includes(key)) {
    throw new Error('That Git configuration setting is not supported.')
  }
  if (['pull.rebase', 'commit.gpgsign'].includes(key) && !['true', 'false', '', null].includes(value)) {
    throw new Error('That Git configuration value is not supported.')
  }
  if (key === 'gpg.format' && !['openpgp', 'ssh', 'x509', '', null].includes(value)) {
    throw new Error('That signing format is not supported.')
  }
  const git = scope === 'local' && repoPath ? g(repoPath) : createGit()
  const scopeFlag = scope === 'local' ? '--local' : '--global'
  if (value === '' || value == null) {
    try {
      await git.raw(['config', scopeFlag, '--unset', key])
    } catch {
      /* already unset */
    }
  } else {
    await git.raw(['config', scopeFlag, key, String(value)])
  }
  return true
}

// Effective identity in a repo (local overrides global) — used to guard commits.
async function getIdentity(repoPath) {
  const git = repoPath ? g(repoPath) : createGit()
  const read = async (key) => {
    try {
      return (await git.raw(['config', key])).trim()
    } catch {
      return ''
    }
  }
  return { name: await read('user.name'), email: await read('user.email') }
}

async function gitVersion() {
  try {
    return (await createGit().raw(['--version'])).trim()
  } catch {
    return ''
  }
}

// ---- credentials -----------------------------------------------------------

async function ensureCredentialHelper() {
  const git = createGit()
  let helper = ''
  try {
    helper = (await git.raw(['config', '--global', 'credential.helper'])).trim()
  } catch {
    /* none set */
  }
  if (!helper) {
    if (process.platform === 'linux') {
      throw new Error(
        'No secure Git credential helper is configured. Install Git Credential Manager or libsecret, configure credential.helper, then try again. GitVista will not save tokens in plaintext.'
      )
    }
    const def = process.platform === 'darwin' ? 'osxkeychain' : 'manager'
    try {
      await git.raw(['config', '--global', 'credential.helper', def])
    } catch {
      /* ignore */
    }
    helper = def
  }
  return helper
}

// Stores a token in the OS credential helper via `git credential approve`, so
// future HTTPS operations to this host authenticate without prompting.
async function storeCredential({ host = 'github.com', username, token, protocol = 'https' }) {
  if (!username || !token) throw new Error('Both a username and a token are required.')
  await ensureCredentialHelper()
  await new Promise((resolve, reject) => {
    const p = spawn('git', ['credential', 'approve'])
    let err = ''
    p.stderr.on('data', (d) => (err += d.toString()))
    p.on('error', reject)
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(err || 'Could not store credential'))))
    p.stdin.write(`protocol=${protocol}\nhost=${host}\nusername=${username}\npassword=${token}\n\n`)
    p.stdin.end()
  })
  return true
}

// ---- learning sandbox ------------------------------------------------------

// Builds (once) a small demo repo with a realistic branching story so a
// beginner can experiment safely. Idempotent: if it already exists, reuse it.
async function createSandbox(repoDir) {
  if (fs.existsSync(path.join(repoDir, '.git'))) return repoDir
  fs.mkdirSync(repoDir, { recursive: true })

  const git = g(repoDir)
  await git.init()
  await git.addConfig('user.name', 'Sandbox Explorer')
  await git.addConfig('user.email', 'explorer@gitvista.local')
  await git.addConfig('commit.gpgsign', 'false')

  const write = (f, c) => fs.writeFileSync(path.join(repoDir, f), c)
  const save = async (msg) => {
    await git.add(['-A'])
    await git.commit(msg)
  }

  write('README.md', '# My First Project\n\nWelcome to your Git learning sandbox.\nExperiment freely — nothing here can break your real work.\n')
  await save('Add project README')

  write('app.js', "function main() {\n  console.log('Hello, Git!')\n}\n\nmain()\n")
  await save('Add the main app file')

  // Normalise the default branch name to "main" regardless of git config.
  try {
    await git.raw(['branch', '-M', 'main'])
  } catch {
    /* already main */
  }

  write('style.css', 'body {\n  font-family: sans-serif;\n}\n')
  await save('Add basic styling')

  // A feature branch that gets merged back — shows a real merge in the graph.
  await git.checkoutLocalBranch('feature/welcome-banner')
  write('banner.js', "export const banner = 'Welcome!'\n")
  await save('Start the welcome banner')
  write('banner.js', "export const banner = 'Welcome to our app!'\n")
  await save('Polish the banner text')

  await git.checkout('main')
  write('app.js', "function main() {\n  console.log('Hello, Git!')\n  console.log('v2')\n}\n\nmain()\n")
  await save('Log a version number')
  await git.merge(['feature/welcome-banner'])

  // A second feature branch left UNMERGED — perfect for practising "merge".
  await git.checkoutLocalBranch('feature/dark-mode')
  write('theme.js', "export const theme = 'dark'\n")
  await save('Add a dark theme toggle')
  write('style.css', 'body {\n  font-family: sans-serif;\n  background: #111;\n  color: #eee;\n}\n')
  await save('Apply dark colours')

  // Back on main, add a commit so main and dark-mode genuinely diverge. Now
  // "Merge dark-mode into main" is a real two-parent merge, not a fast-forward
  // — which makes the merge preview much more instructive.
  await git.checkout('main')
  write('README.md', '# My First Project\n\nWelcome to your Git learning sandbox.\nExperiment freely — nothing here can break your real work.\n\n## Usage\nRun the app and explore!\n')
  await save('Document how to use the project')

  // Leave one uncommitted file so the staging panel has something to show the
  // very first time the sandbox is opened.
  write('notes.txt', 'TODO: try staging this file and making your first commit!\n')

  return repoDir
}

module.exports = {
  isGitRepo,
  initRepo,
  getRepoData,
  getGitDirectory,
  getGitCommonDirectory,
  getStatus,
  getCommitFiles,
  getFileDiff,
  searchHistory,
  stageFile,
  unstageFile,
  stageAll,
  unstageAll,
  stageHunk,
  unstageHunk,
  discardFile,
  commit,
  amendCommit,
  createBranch,
  checkout,
  checkoutRemote,
  renameBranch,
  moveBranch,
  merge,
  fetch,
  pull,
  push,
  forcePush,
  pushTag,
  deleteRemoteTag,
  deleteRemoteBranch,
  stash,
  stashPop,
  stashApply,
  stashDrop,
  deleteBranch,
  addRemote,
  removeRemote,
  renameRemote,
  setUpstream,
  unsetUpstream,
  getWorktrees,
  addWorktree,
  getReflog,
  getUndoTarget,
  getCommitFileDiff,
  getFileContent,
  getFileHistory,
  getFileBlame,
  getChangedBetween,
  getDiffBetween,
  cherryPick,
  revertCommit,
  rebase,
  interactiveRebase,
  createTag,
  deleteTag,
  createBranchAt,
  resetTo,
  uncommit,
  resolveUsing,
  markResolved,
  abortOperation,
  continueOperation,
  clone,
  getGitConfig,
  setGitConfig,
  getIdentity,
  gitVersion,
  storeCredential,
  createSandbox,
  resolveRepoFile,
  createGit,
}
