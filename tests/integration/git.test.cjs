const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync, spawnSync } = require('node:child_process')

const gitService = require('../../electron/git.cjs')

function git(repoPath, args) {
  return execFileSync('git', args, {
    cwd: repoPath,
    encoding: 'utf8',
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function refExists(repoPath, ref) {
  return spawnSync('git', ['show-ref', '--verify', '--quiet', ref], {
    cwd: repoPath,
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: '1' },
  }).status === 0
}

function createRepo({ commit = false } = {}) {
  const repoPath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitvista-tests-'))
  git(repoPath, ['init', '--quiet'])
  git(repoPath, ['config', '--local', 'user.name', 'GitVista Tests'])
  git(repoPath, ['config', '--local', 'user.email', 'tests@gitvista.local'])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'original\n')
  git(repoPath, ['add', 'tracked.txt'])
  if (commit) git(repoPath, ['commit', '--quiet', '-m', 'Initial commit'])
  return repoPath
}

test('unstageAll clears the index before the first commit and preserves the working file', async () => {
  const repoPath = createRepo()
  assert.equal(git(repoPath, ['diff', '--cached', '--name-only']), 'tracked.txt')

  await gitService.unstageAll(repoPath)

  assert.equal(git(repoPath, ['diff', '--cached', '--name-only']), '')
  assert.equal(fs.readFileSync(path.join(repoPath, 'tracked.txt'), 'utf8'), 'original\n')
})

test('discardFile does not delete a tracked file when Git cannot restore it', async () => {
  const repoPath = createRepo({ commit: true })
  const filePath = path.join(repoPath, 'tracked.txt')
  fs.writeFileSync(filePath, 'important local work\n')
  fs.writeFileSync(path.join(repoPath, '.git', 'index'), 'corrupt index for regression test\n')

  await assert.rejects(() => gitService.discardFile(repoPath, 'tracked.txt'))
  await assert.rejects(() => gitService.getStatus(repoPath))

  assert.equal(fs.readFileSync(filePath, 'utf8'), 'important local work\n')
})

test('renamed files retain real paths in commit details and comparisons', async () => {
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['mv', 'tracked.txt', 'renamed file.txt'])
  git(repoPath, ['commit', '--quiet', '-m', 'Rename tracked file'])
  const head = git(repoPath, ['rev-parse', 'HEAD'])

  const details = await gitService.getCommitFiles(repoPath, head)
  const comparison = await gitService.getChangedBetween(repoPath, 'HEAD~1', 'HEAD')
  const diff = await gitService.getCommitFileDiff(repoPath, head, 'renamed file.txt', 'tracked.txt')
  const comparisonDiff = await gitService.getDiffBetween(repoPath, 'HEAD~1', 'HEAD', 'renamed file.txt', 'tracked.txt')

  assert.equal(details.files[0].path, 'renamed file.txt')
  assert.equal(details.files[0].previousPath, 'tracked.txt')
  assert.equal(comparison[0].path, 'renamed file.txt')
  assert.equal(comparison[0].previousPath, 'tracked.txt')
  assert.match(diff, /rename from tracked\.txt/)
  assert.match(diff, /rename to renamed file\.txt/)
  assert.match(comparisonDiff, /rename from tracked\.txt/)

  const history = await gitService.getFileHistory(repoPath, 'renamed file.txt')
  assert.equal(history[0].path, 'renamed file.txt')
  assert.equal(history[0].previousPath, 'tracked.txt')
  assert.equal(history[1].path, 'tracked.txt')
})

test('repository file reads reject paths outside the repository', async () => {
  const repoPath = createRepo({ commit: true })
  const outsidePath = path.join(path.dirname(repoPath), `${path.basename(repoPath)}-secret.txt`)
  fs.writeFileSync(outsidePath, 'secret\n')

  await assert.rejects(() => gitService.getFileContent(repoPath, `../${path.basename(outsidePath)}`), /outside/i)
})

test('untracked text files have a bounded unified preview and binary files have a safe notice', async () => {
  const repoPath = createRepo({ commit: true })
  fs.writeFileSync(path.join(repoPath, 'notes.txt'), 'first\nsecond\n')
  fs.writeFileSync(path.join(repoPath, 'image.bin'), Buffer.from([0x47, 0x56, 0x00, 0x01]))
  fs.writeFileSync(path.join(repoPath, 'large.txt'), Buffer.alloc(5 * 1024 * 1024 + 1, 0x61))

  const textDiff = await gitService.getFileDiff(repoPath, 'notes.txt', false)
  const binaryDiff = await gitService.getFileDiff(repoPath, 'image.bin', false)
  const binaryContent = await gitService.getFileContent(repoPath, 'image.bin')
  const largeContent = await gitService.getFileContent(repoPath, 'large.txt')

  assert.match(textDiff, /^diff --git/m)
  assert.match(textDiff, /^@@ -0,0 \+1,2 @@$/m)
  assert.match(textDiff, /^\+second$/m)
  assert.match(binaryDiff, /^GITVISTA_DIFF_NOTICE\n/)
  assert.match(binaryDiff, /binary/i)
  assert.match(binaryContent, /^GITVISTA_DIFF_NOTICE\n/)
  assert.match(binaryContent, /binary/i)
  assert.match(largeContent, /^GITVISTA_DIFF_NOTICE\n/)
  assert.match(largeContent, /larger than 5 MB/i)
})

test('hunk patches are streamed safely into Git and can be reversed', async () => {
  const repoPath = createRepo({ commit: true })
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'changed\n')

  const workingPatch = await gitService.getFileDiff(repoPath, 'tracked.txt', false)
  await gitService.stageHunk(repoPath, workingPatch)
  const stagedPatch = await gitService.getFileDiff(repoPath, 'tracked.txt', true)

  assert.match(stagedPatch, /^diff --git/m)
  assert.match(stagedPatch, /^\+changed$/m)

  await gitService.unstageHunk(repoPath, stagedPatch)
  assert.equal(git(repoPath, ['diff', '--cached', '--name-only']), '')
  assert.equal(fs.readFileSync(path.join(repoPath, 'tracked.txt'), 'utf8'), 'changed\n')
})

test('invalid comparisons report Git errors instead of looking like empty diffs', async () => {
  const repoPath = createRepo({ commit: true })

  await assert.rejects(() => gitService.getCommitFileDiff(repoPath, 'missing-ref', 'tracked.txt'))
  await assert.rejects(() => gitService.getChangedBetween(repoPath, 'HEAD', 'missing-ref'))
  await assert.rejects(() => gitService.getDiffBetween(repoPath, 'HEAD', 'missing-ref', 'tracked.txt'))
})

test('file history follows commits and blame attributes current lines', async () => {
  const repoPath = createRepo({ commit: true })
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'original\nsecond line\n')
  git(repoPath, ['add', 'tracked.txt'])
  git(repoPath, ['commit', '--quiet', '-m', 'Add another line'])

  const history = await gitService.getFileHistory(repoPath, 'tracked.txt')
  const blame = await gitService.getFileBlame(repoPath, 'tracked.txt')
  const messageSearch = await gitService.searchHistory(repoPath, 'another line', 'history')
  const pickaxeSearch = await gitService.searchHistory(repoPath, 'second line', 'pickaxe')
  const commitInfo = await gitService.getCommitFiles(repoPath, git(repoPath, ['rev-parse', 'HEAD']))

  assert.deepEqual(history.map((entry) => entry.subject), ['Add another line', 'Initial commit'])
  assert.equal(blame.lines.length, 2)
  assert.equal(blame.lines[1].content, 'second line')
  assert.equal(blame.lines[1].author.name, 'GitVista Tests')
  assert.equal(messageSearch.commits[0].subject, 'Add another line')
  assert.equal(pickaxeSearch.commits[0].subject, 'Add another line')
  assert.equal(commitInfo.signature.status, 'N')
  assert.equal(commitInfo.files[0].path, 'tracked.txt')
})

test('history searches return an empty result for a repository without commits', async () => {
  const repoPath = createRepo()
  git(repoPath, ['reset'])

  const messageSearch = await gitService.searchHistory(repoPath, 'anything', 'history')
  const pickaxeSearch = await gitService.searchHistory(repoPath, 'anything', 'pickaxe')

  assert.deepEqual(messageSearch, { commits: [], truncated: false })
  assert.deepEqual(pickaxeSearch, { commits: [], truncated: false })
})

test('clone rejects a destination that could escape its selected parent folder', async () => {
  const sourcePath = createRepo({ commit: true })
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitvista-clone-parent-'))

  await assert.rejects(() => gitService.clone(parentDir, sourcePath, '../escaped-clone'), /single folder/i)
})

test('repository Git profiles require a repository and remain isolated from global config', async () => {
  const repoPath = createRepo({ commit: true })

  await assert.rejects(() => gitService.getGitConfig('local'), /repository/i)
  await assert.rejects(() => gitService.setGitConfig('local', 'user.name', 'Local Person'), /repository/i)

  await gitService.setGitConfig('local', 'user.name', 'Local Person', repoPath)
  await gitService.setGitConfig('local', 'commit.gpgsign', 'true', repoPath)
  await gitService.setGitConfig('local', 'gpg.format', 'ssh', repoPath)
  const config = await gitService.getGitConfig('local', repoPath)

  assert.equal(config.name, 'Local Person')
  assert.equal(config.signCommits, true)
  assert.equal(config.signingFormat, 'ssh')

  await gitService.setGitConfig('local', 'commit.gpgsign', '', repoPath)
  await gitService.setGitConfig('local', 'gpg.format', '', repoPath)
  const inherited = await gitService.getGitConfig('local', repoPath)
  assert.equal(inherited.signCommits, null)
  assert.equal(inherited.signingFormat, '')
})

test('interactive rebase accepts the explicit root mode without allowing arbitrary Git options', async () => {
  const repoPath = createRepo({ commit: true })
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'second revision\n')
  git(repoPath, ['add', 'tracked.txt'])
  git(repoPath, ['commit', '--quiet', '-m', 'Second commit'])
  const commits = git(repoPath, ['log', '--reverse', '--format=%H%x1f%s'])
    .split('\n')
    .map((line) => {
      const [hash, message] = line.split('\x1f')
      return { action: 'pick', hash, message }
    })

  await gitService.interactiveRebase(repoPath, '--root', commits)

  assert.deepEqual(git(repoPath, ['log', '--reverse', '--format=%s']).split('\n'), ['Initial commit', 'Second commit'])
})

test('worktrees are created, listed, and opened with their linked Git directory', async () => {
  const repoPath = createRepo({ commit: true })
  const parentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gitvista-worktrees-'))

  const worktreePath = await gitService.addWorktree(repoPath, parentDir, 'linked-tree', 'HEAD', 'feature/linked-tree')
  const worktrees = await gitService.getWorktrees(repoPath)
  const linkedData = await gitService.getRepoData(worktreePath)
  const linkedGitDir = await gitService.getGitDirectory(worktreePath)

  assert.equal(worktreePath, path.join(fs.realpathSync(parentDir), 'linked-tree'))
  assert.equal(worktrees.length, 2)
  assert.equal(worktrees.find((entry) => entry.path === worktreePath)?.branch, 'feature/linked-tree')
  assert.equal(linkedData.currentBranch, 'feature/linked-tree')
  assert.equal(linkedData.worktrees.length, 2)
  assert.match(linkedGitDir, /[\\/]worktrees[\\/]/)
})

test('remote checkout creates a correctly tracked local branch', async () => {
  const repoPath = createRepo({ commit: true })
  const barePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitvista-checkout-remote-'))
  git(barePath, ['init', '--bare', '--quiet'])
  git(repoPath, ['remote', 'add', 'origin', barePath])
  git(repoPath, ['branch', 'feature/tracked'])
  git(repoPath, ['push', 'origin', 'refs/heads/feature/tracked:refs/heads/feature/tracked'])
  git(repoPath, ['fetch', 'origin'])

  const local = await gitService.checkoutRemote(repoPath, 'origin/feature/tracked')

  assert.equal(local, 'feature/tracked')
  assert.equal(git(repoPath, ['branch', '--show-current']), 'feature/tracked')
  assert.equal(git(repoPath, ['rev-parse', '--abbrev-ref', '@{upstream}']), 'origin/feature/tracked')
})

test('remote tag and branch deletion use explicit validated refspecs', async () => {
  const repoPath = createRepo({ commit: true })
  const barePath = fs.mkdtempSync(path.join(os.tmpdir(), 'gitvista-remote-'))
  git(barePath, ['init', '--bare', '--quiet'])
  git(repoPath, ['remote', 'add', 'origin', barePath])

  git(repoPath, ['tag', 'v-test'])
  await gitService.pushTag(repoPath, 'v-test')
  assert.match(git(barePath, ['show-ref', '--verify', 'refs/tags/v-test']), /refs\/tags\/v-test/)

  await gitService.deleteRemoteTag(repoPath, 'v-test')
  assert.equal(refExists(barePath, 'refs/tags/v-test'), false)

  git(repoPath, ['branch', 'remote-delete'])
  git(repoPath, ['push', 'origin', 'refs/heads/remote-delete:refs/heads/remote-delete'])
  await gitService.deleteRemoteBranch(repoPath, 'origin/remote-delete')
  assert.equal(refExists(barePath, 'refs/heads/remote-delete'), false)
})

test('staging a literal filename never expands Git pathspecs or command options', async () => {
  const repoPath = createRepo({ commit: true })
  for (const file of ['*.txt', 'other.txt', '-A', ':(glob)*']) fs.writeFileSync(path.join(repoPath, file), `${file}\n`)
  await gitService.stageFile(repoPath, '*.txt')
  assert.deepEqual(git(repoPath, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean), ['*.txt'])
  await gitService.unstageAll(repoPath)
  await gitService.stageFile(repoPath, '-A')
  assert.deepEqual(git(repoPath, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean), ['-A'])
  await gitService.unstageAll(repoPath)
  await gitService.stageFile(repoPath, ':(glob)*')
  assert.deepEqual(git(repoPath, ['diff', '--cached', '--name-only', '-z']).split('\0').filter(Boolean), [':(glob)*'])
})

test('a clean tracked file has no working diff', async () => {
  const repoPath = createRepo({ commit: true })
  assert.equal(await gitService.getFileDiff(repoPath, 'tracked.txt', false), '')
})

test('unstaging a rename restores both index paths and preserves the renamed working file', async () => {
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['mv', 'tracked.txt', 'renamed.txt'])
  const status = await gitService.getStatus(repoPath)
  assert.equal(status.staged[0].previousPath, 'tracked.txt')
  await gitService.unstageFile(repoPath, 'renamed.txt')
  assert.equal(git(repoPath, ['diff', '--cached', '--name-only']), '')
  assert.equal(fs.readFileSync(path.join(repoPath, 'renamed.txt'), 'utf8'), 'original\n')
})

test('merge details and patches include changes relative to the first parent', async () => {
  const repoPath = createRepo({ commit: true })
  const main = git(repoPath, ['branch', '--show-current'])
  git(repoPath, ['checkout', '-b', 'feature'])
  fs.writeFileSync(path.join(repoPath, 'feature.txt'), 'feature work\n')
  git(repoPath, ['add', 'feature.txt'])
  git(repoPath, ['commit', '--quiet', '-m', 'Feature work'])
  git(repoPath, ['checkout', main])
  git(repoPath, ['merge', '--no-ff', 'feature', '-m', 'Merge feature'])
  const details = await gitService.getCommitFiles(repoPath, 'HEAD')
  assert.deepEqual(details.files.map((file) => file.path), ['feature.txt'])
  assert.match(await gitService.getCommitFileDiff(repoPath, 'HEAD', 'feature.txt'), /^\+feature work$/m)
})

test('opening a repository subfolder returns its canonical working-tree root', async () => {
  const repoPath = createRepo({ commit: true })
  fs.mkdirSync(path.join(repoPath, 'nested'))
  const data = await gitService.getRepoData(path.join(repoPath, 'nested'))
  assert.equal(data.path, fs.realpathSync(repoPath))
})

test('history includes detached commits that are not reachable from a branch', async () => {
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['checkout', '--detach'])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'detached work\n')
  git(repoPath, ['add', 'tracked.txt'])
  git(repoPath, ['commit', '--quiet', '-m', 'Detached work'])
  const data = await gitService.getRepoData(repoPath)
  assert.equal(data.detached, true)
  assert.equal(data.commits[0].hash, data.head)
  assert.equal((await gitService.searchHistory(repoPath, 'Detached work')).commits[0]?.hash, data.head)
})

test('marking a file resolved refuses remaining conflict markers', async () => {
  const repoPath = createRepo({ commit: true })
  const main = git(repoPath, ['branch', '--show-current'])
  git(repoPath, ['checkout', '-b', 'conflicting'])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'incoming\n')
  git(repoPath, ['commit', '-am', 'Incoming'])
  git(repoPath, ['checkout', main])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'current\n')
  git(repoPath, ['commit', '-am', 'Current'])
  await assert.rejects(() => gitService.merge(repoPath, 'conflicting'))
  await assert.rejects(() => gitService.markResolved(repoPath, 'tracked.txt'), /conflict markers/i)
  assert.equal((await gitService.getStatus(repoPath)).unstaged[0].status, 'conflicted')
})

test('punctuation in branch names remains one accurate graph label', async () => {
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['branch', 'feature/one,two'])
  const data = await gitService.getRepoData(repoPath)
  assert.ok(data.commits[0].refs.some((ref) => ref.name === 'feature/one,two'))
  assert.equal(data.commits[0].refs.some((ref) => ref.name === 'two'), false)
})

test('interactive rebase preserves a later reword after pausing for a conflict', async () => {
  const repoPath = createRepo({ commit: true })
  const main = git(repoPath, ['branch', '--show-current'])
  git(repoPath, ['checkout', '-b', 'feature'])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'feature version\n')
  git(repoPath, ['commit', '-am', 'Feature version'])
  const first = git(repoPath, ['rev-parse', 'HEAD'])
  fs.writeFileSync(path.join(repoPath, 'later.txt'), 'later work\n')
  git(repoPath, ['add', 'later.txt'])
  git(repoPath, ['commit', '-m', 'Original later message'])
  const second = git(repoPath, ['rev-parse', 'HEAD'])
  git(repoPath, ['checkout', main])
  fs.writeFileSync(path.join(repoPath, 'tracked.txt'), 'upstream version\n')
  git(repoPath, ['commit', '-am', 'Upstream version'])
  const onto = git(repoPath, ['rev-parse', 'HEAD'])
  git(repoPath, ['checkout', 'feature'])
  await assert.rejects(() => gitService.interactiveRebase(repoPath, onto, [
    { action: 'pick', hash: first, message: 'Feature version' },
    { action: 'reword', hash: second, message: 'Reword survives the conflict\n\nFull body retained.' },
  ]))
  await gitService.resolveUsing(repoPath, 'tracked.txt', 'ours')
  await gitService.continueOperation(repoPath, 'rebase')
  assert.equal(git(repoPath, ['log', '-1', '--format=%B']), 'Reword survives the conflict\n\nFull body retained.')
})

test('reflog dates describe the operation, not the old commit date', async () => {
  const repoPath = createRepo()
  git(repoPath, ['commit', '-m', 'Old commit'])
  const environment = { ...process.env, GIT_COMMITTER_DATE: '2001-01-01T00:00:00Z' }
  execFileSync('git', ['commit', '--amend', '--no-edit', '--date=2001-01-01T00:00:00Z'], { cwd: repoPath, env: environment })
  git(repoPath, ['reset', '--soft', 'HEAD'])
  const log = await gitService.getReflog(repoPath)
  assert.ok(log[0].timestamp > Date.now() - 60000)
  assert.equal(log[0].selector, 'HEAD@{0}')
})

test('Git receives the hardened environment and no other inherited Git variables', async () => {
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['branch', 'feature'])
  const hooks = path.join(repoPath, '.git', 'hooks')
  const envFile = path.join(repoPath, '.git', 'hook-env.txt')
  git(repoPath, ['config', '--local', 'core.hooksPath', hooks])
  fs.writeFileSync(path.join(hooks, 'post-checkout'), `#!/bin/sh\nenv > "${envFile}"\n`, { mode: 0o755 })
  process.env.GIT_GITVISTA_PROBE = 'inherited'
  try {
    await gitService.checkout(repoPath, 'feature')
  } finally {
    delete process.env.GIT_GITVISTA_PROBE
  }
  const env = Object.fromEntries(
    fs.readFileSync(envFile, 'utf8').split('\n').filter((line) => line.includes('='))
      .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
  )
  assert.equal(env.GIT_TERMINAL_PROMPT, '0')
  assert.equal(env.GIT_EDITOR, 'true')
  assert.equal(env.GIT_SEQUENCE_EDITOR, 'true')
  assert.equal(env.GIT_LITERAL_PATHSPECS, '1')
  assert.equal(env.GIT_OPTIONAL_LOCKS, '0')
  assert.equal(env.GIT_SSH_COMMAND, process.env.GIT_SSH_COMMAND)
  assert.equal(env.GIT_GITVISTA_PROBE, undefined)
  assert.equal(env.HOME, process.env.HOME)
})

test('GitHub remotes resolve through the hardened Git factory', async () => {
  const { resolveRepository } = require('../../electron/github.cjs')
  const repoPath = createRepo({ commit: true })
  git(repoPath, ['remote', 'add', 'upstream', 'https://example.com/other.git'])
  git(repoPath, ['remote', 'add', 'origin', 'git@github.com:owner/project.git'])
  assert.deepEqual(await resolveRepository(repoPath), { owner: 'owner', repo: 'project', remote: 'origin' })
})
