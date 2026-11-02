const test = require('node:test')
const assert = require('node:assert/strict')

const { validateIpcArgs, schemas } = require('../../electron/ipc-validation.cjs')

test('every declared IPC channel validates a known argument shape', () => {
  assert.ok(Object.keys(schemas).length >= 60)
  assert.doesNotThrow(() => validateIpcArgs('repo:data', ['/tmp/repository']))
  assert.doesNotThrow(() => validateIpcArgs('repo:watchStart', ['/tmp/repository']))
  assert.doesNotThrow(() => validateIpcArgs('repo:watchStop', ['/tmp/repository']))
  assert.doesNotThrow(() => validateIpcArgs('history:search', ['/tmp/repository', 'authentication', 'pickaxe']))
  assert.doesNotThrow(() => validateIpcArgs('action:commit', ['/tmp/repository', 'Subject\n\nCommit body']))
  assert.doesNotThrow(() => validateIpcArgs('github:mergePullRequest', ['/tmp/repository', 42, 'squash', 'a'.repeat(40)]))
  assert.doesNotThrow(() => validateIpcArgs('github:createReview', ['/tmp/repository', 42, 'APPROVE', '', 'a'.repeat(40)]))
  assert.doesNotThrow(() => validateIpcArgs('clipboard:writeText', ['abc123']))
  assert.doesNotThrow(() => validateIpcArgs('file:diff', ['/tmp/repository', 'src/App.jsx', false]))
  assert.doesNotThrow(() => validateIpcArgs('commit:fileDiff', ['/tmp/repository', 'abc123', 'new.txt', 'old.txt']))
  assert.doesNotThrow(() => validateIpcArgs('file:history', ['/tmp/repository', 'src/App.jsx', null]))
  assert.doesNotThrow(() => validateIpcArgs('worktree:add', ['/tmp/repository', '/tmp', 'feature-tree', 'HEAD', 'feature']))
  assert.doesNotThrow(() => validateIpcArgs('action:interactiveRebase', [
    '/tmp/repository',
    '--root',
    [{ action: 'pick', hash: 'abc123', message: 'Initial commit' }],
  ]))
})

test('repository file arguments reject traversal and absolute paths', () => {
  assert.throws(() => validateIpcArgs('file:content', ['/tmp/repository', '../secret']), /inside/i)
  assert.throws(() => validateIpcArgs('file:content', ['/tmp/repository', '/etc/passwd']), /inside/i)
  assert.throws(() => validateIpcArgs('compare:diff', ['/tmp/repository', 'main', 'feature', '../secret', null]), /inside/i)
  assert.throws(() => validateIpcArgs('worktree:add', ['/tmp/repository', '/tmp', '../tree', 'HEAD', null]), /single folder/i)
})

test('external links must use HTTPS', () => {
  assert.doesNotThrow(() => validateIpcArgs('shell:openExternal', ['https://github.com/example/repo']))
  assert.throws(() => validateIpcArgs('shell:openExternal', ['http://example.com']), /HTTPS/i)
  assert.throws(() => validateIpcArgs('shell:openExternal', ['file:///tmp/secret']), /HTTPS/i)
})

test('credentials require an HTTPS host, username, and token', () => {
  assert.doesNotThrow(() =>
    validateIpcArgs('creds:store', [{ host: 'github.com', username: 'person', token: 'secret', protocol: 'https' }])
  )
  assert.throws(() => validateIpcArgs('creds:store', [{ host: 'github.com', username: 'person', token: '' }]), /token/i)
})

test('unknown channels and incorrect argument counts are rejected', () => {
  assert.throws(() => validateIpcArgs('unknown:channel', []), /not registered/i)
  assert.throws(() => validateIpcArgs('repo:data', []), /arguments/i)
  assert.throws(() => validateIpcArgs('action:stashDrop', ['/tmp/repository', -1]), /non-negative/i)
  assert.throws(() => validateIpcArgs('action:stashApply', ['/tmp/repository', 1.5]), /whole number/i)
  assert.throws(() => validateIpcArgs('github:mergePullRequest', ['/tmp/repository', 42, 'merge', 'abc123']), /Commit ID/i)
})

test('clipboard values reject empty text and embedded null bytes', () => {
  assert.throws(() => validateIpcArgs('clipboard:writeText', ['']), /Clipboard text/i)
  assert.throws(() => validateIpcArgs('clipboard:writeText', ['safe\0unsafe']), /Clipboard text/i)
})

test('Git arguments, clone folders, and configuration keys reject option or path injection', () => {
  assert.throws(() => validateIpcArgs('action:checkout', ['/tmp/repository', '--detach']), /dash/i)
  assert.throws(() => validateIpcArgs('action:interactiveRebase', ['/tmp/repository', '--exec=unsafe', [{ action: 'pick', hash: 'abc123', message: '' }]]), /dash/i)
  assert.throws(() => validateIpcArgs('remote:add', ['/tmp/repository', 'origin', '--upload-pack=helper']), /dash/i)
  assert.throws(() => validateIpcArgs('repo:clone', ['/tmp', 'https://github.com/example/repo.git', '../escape']), /single folder/i)
  assert.throws(() => validateIpcArgs('config:set', ['global', 'core.sshCommand', 'malicious-helper', null]), /not supported/i)
  assert.throws(() => validateIpcArgs('config:get', ['local', null]), /repository/i)
  assert.throws(() => validateIpcArgs('config:set', ['local', 'user.name', 'Ada', null]), /repository/i)
  assert.throws(() => validateIpcArgs('config:set', ['global', 'user.name', 'Ada\nInjected', null]), /Configuration value/i)
  assert.doesNotThrow(() => validateIpcArgs('config:set', ['local', 'commit.gpgsign', 'true', '/tmp/repository']))
  assert.doesNotThrow(() => validateIpcArgs('config:set', ['local', 'user.signingkey', '~/.ssh/id_ed25519.pub', '/tmp/repository']))
})
