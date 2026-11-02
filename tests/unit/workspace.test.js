import test from 'node:test'
import assert from 'node:assert/strict'
import { changedFileCount, normaliseSession } from '../../src/lib/repositorySession.js'
import { createOperationGate } from '../../electron/operation-gate.cjs'

const repo = { head: 'head', commits: [{ hash: 'head' }, { hash: 'older' }], status: { clean: false } }

test('a partially staged file counts once in the workspace summary', () => {
  assert.equal(changedFileCount({ staged: [{ path: 'a' }], unstaged: [{ path: 'a' }, { path: 'b' }], untracked: [{ path: 'c' }] }), 3)
})

test('restored workspaces keep full commit drafts and selection', () => {
  const draft = { selectedHash: 'older', rightTab: 'details', message: 'Summary\n\nDraft body', coAuthors: [{ name: 'Contributor', email: 'name@example.com' }] }
  assert.deepEqual(normaliseSession(draft, repo), draft)
})

test('malformed preferences and unreachable selections recover safely', () => {
  assert.deepEqual(normaliseSession({ selectedHash: 'removed', rightTab: 'bad', message: 10, coAuthors: [null, {}] }, repo), {
    selectedHash: 'head', rightTab: 'changes', message: '', coAuthors: [],
  })
  assert.equal(normaliseSession(null, { ...repo, status: { clean: true } }).rightTab, 'details')
})

test('a running mutation rejects a second intent and releases on failure', async () => {
  const run = createOperationGate()
  let fail
  const first = run('Staging files', () => new Promise((_resolve, reject) => { fail = reject }))
  let invoked = false
  await assert.rejects(() => run('Switching branch', () => { invoked = true }), /Staging files/)
  assert.equal(invoked, false)
  fail(new Error('Index locked'))
  await assert.rejects(() => first, /Index locked/)
  assert.equal(await run('Retrying', async () => 'done'), 'done')
})
