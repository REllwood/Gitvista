import test from 'node:test'
import assert from 'node:assert/strict'

import { splitHunks, buildHunkPatch, isPatchable, wordDiff } from '../../src/lib/diff.js'
import { computeGraph } from '../../src/lib/graphLayout.js'
import { parseGitHubRemote, buildCompareUrl } from '../../src/lib/github.js'
import { slugifyBranch } from '../../src/lib/slug.js'
import { getActionMeta } from '../../src/lib/actions.js'
import { buildPreview } from '../../src/lib/preview.js'
import { appendCoAuthors, normaliseCoAuthor } from '../../src/lib/commitMessage.js'
import { normaliseRecentRepos, touchRecentRepo } from '../../src/lib/recentRepos.js'
import { commandScore } from '../../src/lib/commandSearch.js'
import { prepareGraphCommits, groupRefs, branchOwnCommits, WIP_HASH } from '../../src/lib/graphCommits.js'

const repo = {
  currentBranch: 'main',
  head: 'c3',
  status: { ahead: 1, behind: 0 },
  commits: [
    {
      hash: 'c3',
      parents: ['c2', 'f1'],
      subject: 'Merge feature',
      refs: [{ name: 'main', type: 'head' }],
      author: { name: 'A', email: 'a@example.com' },
    },
    {
      hash: 'f1',
      parents: ['c1'],
      subject: 'Feature',
      refs: [{ name: 'feature', type: 'branch' }],
      author: { name: 'B', email: 'b@example.com' },
    },
    {
      hash: 'c2',
      parents: ['c1'],
      subject: 'Main work',
      refs: [],
      author: { name: 'A', email: 'a@example.com' },
    },
    {
      hash: 'c1',
      parents: [],
      subject: 'Initial',
      refs: [],
      author: { name: 'A', email: 'a@example.com' },
    },
  ],
}

test('computeGraph gives every visible parent edge a concrete row and lane', () => {
  const graph = computeGraph(repo.commits)
  assert.equal(graph.nodes.length, 4)
  assert.equal(graph.edges.length, 4)
  assert.ok(graph.edges.every((edge) => Number.isInteger(edge.toRow) && Number.isInteger(edge.toLane)))
  assert.ok(graph.laneCount >= 2)
})

test('hunk helpers preserve a valid header and isolate individual hunks', () => {
  const diff = [
    'diff --git a/file.txt b/file.txt',
    '--- a/file.txt',
    '+++ b/file.txt',
    '@@ -1 +1 @@',
    '-old',
    '+new',
    '@@ -10 +10 @@',
    '-before',
    '+after',
    '',
  ].join('\n')
  const split = splitHunks(diff)
  assert.equal(split.hunks.length, 2)
  assert.equal(isPatchable(diff), true)
  assert.match(buildHunkPatch(split.header, split.hunks[0].raw), /\+new\n$/)
  assert.doesNotMatch(buildHunkPatch(split.header, split.hunks[0].raw), /\+after/)
})

test('wordDiff bounds pathological input and still marks the change', () => {
  const oldLine = Array.from({ length: 500 }, (_, i) => `old${i}`).join(' ')
  const newLine = Array.from({ length: 500 }, (_, i) => `new${i}`).join(' ')
  const result = wordDiff(oldLine, newLine)
  assert.deepEqual(result.old, [{ text: oldLine, changed: true }])
  assert.deepEqual(result.new, [{ text: newLine, changed: true }])
})

test('GitHub remote parsing rejects lookalike hosts and handles SSH remotes', () => {
  assert.deepEqual(parseGitHubRemote('git@github.com:owner/repo.git'), {
    host: 'github.com',
    owner: 'owner',
    repo: 'repo',
    isGitHub: true,
  })
  assert.equal(parseGitHubRemote('https://mygithub.com/owner/repo.git').isGitHub, false)
  assert.match(
    buildCompareUrl({ host: 'github.com', owner: 'owner', repo: 'repo', base: 'main', head: 'feature/test', title: 'A title' }),
    /^https:\/\/github\.com\/owner\/repo\/compare\/main\.\.\.feature\/test\?/
  )
})

test('branch slugs remove invalid ref syntax without losing readable segments', () => {
  assert.equal(slugifyBranch('  Café login / Final.lock  '), 'cafe-login/finallock')
  assert.equal(slugifyBranch('../../danger..branch'), 'danger.branch')
})

test('force push remains destructive, lease-protected, and previewed with a warning', () => {
  const meta = getActionMeta({ type: 'forcePush' }, repo)
  const preview = buildPreview(repo, { type: 'forcePush' })
  assert.equal(meta.destructive, true)
  assert.match(meta.command, /--force-with-lease/)
  assert.match(meta.explain, /overwrite/i)
  assert.match(preview.note, /remote branch/i)
  assert.match(preview.note, /--force-with-lease/)
})

test('remote branch deletion is explicit and destructive', () => {
  const meta = getActionMeta({ type: 'deleteRemoteBranch', name: 'origin/obsolete' }, repo)
  assert.equal(meta.destructive, true)
  assert.match(meta.command, /git push origin --delete obsolete/)
  assert.match(meta.explain, /shared remote/i)
})

test('unstash names the exact stash it restores', () => {
  const newest = getActionMeta({ type: 'stashPop', index: 0 }, repo)
  const older = getActionMeta({ type: 'stashPop', index: 2 }, repo)
  assert.equal(newest.command, 'git stash pop stash@{0}')
  assert.match(newest.explain, /most recently stashed/)
  assert.equal(older.command, 'git stash pop stash@{2}')
  assert.doesNotMatch(older.explain, /most recently/)
  assert.match(older.explain, /removes the stash/)
})

test('co-author trailers are validated, normalised, and deduplicated', () => {
  assert.deepEqual(normaliseCoAuthor({ name: '  Grace   Hopper ', email: 'grace@example.com ' }), {
    name: 'Grace Hopper',
    email: 'grace@example.com',
  })
  assert.equal(normaliseCoAuthor({ name: 'Unsafe\nName', email: 'safe@example.com' }), null)
  assert.equal(normaliseCoAuthor({ name: 'Person', email: 'not-an-email' }), null)

  const message = appendCoAuthors('Ship the change', [
    { name: 'Grace Hopper', email: 'grace@example.com' },
    { name: 'Duplicate', email: 'GRACE@example.com' },
    { name: 'Alan Turing', email: 'alan@example.com' },
  ])
  assert.equal(
    message,
    'Ship the change\n\nCo-authored-by: Grace Hopper <grace@example.com>\nCo-authored-by: Alan Turing <alan@example.com>'
  )
  assert.equal(
    appendCoAuthors(`${message}\nCo-authored-by: Existing Person <existing@example.com>`, [
      { name: 'Existing Person', email: 'EXISTING@example.com' },
    ]),
    `${message}\nCo-authored-by: Existing Person <existing@example.com>`
  )
})

test('recent repositories are unique, ordered, and bounded', () => {
  assert.deepEqual(normaliseRecentRepos(['/one', '', '/two', '/one', null]), ['/one', '/two'])
  assert.deepEqual(touchRecentRepo(['/one', '/two'], '/two'), ['/two', '/one'])
  assert.deepEqual(touchRecentRepo(['/one', '/two', '/three'], '/four', 3), ['/four', '/one', '/two'])
})

test('command search finds keyword and punctuation-separated matches', () => {
  const forcePush = {
    label: 'Force-push with lease',
    category: 'Remote · destructive',
    keywords: 'overwrite safe lease',
  }
  const clone = { label: 'Clone repository', category: 'Repository', keywords: 'remote URL download' }

  assert.ok(commandScore(forcePush, 'force push') >= 0)
  assert.ok(commandScore(forcePush, 'overwrite remote') >= 0)
  assert.ok(commandScore(clone, 'download') >= 0)
  assert.equal(commandScore(clone, 'force push'), -1)
})

test('stash helper commits stay out of the graph and a stash keeps one parent', () => {
  const commits = [
    { hash: 'stash', parents: ['head', 'index', 'untracked'], subject: 'On main: draft', refs: [] },
    { hash: 'index', parents: ['head'], subject: 'index on main: head', refs: [] },
    { hash: 'untracked', parents: [], subject: 'untracked files on main: head', refs: [] },
    { hash: 'head', parents: ['root'], subject: 'Polish', refs: [{ name: 'main', type: 'head' }] },
    { hash: 'root', parents: [], subject: 'Start', refs: [] },
  ]
  const prepared = prepareGraphCommits(commits, { stashes: [{ index: 0, hash: 'stash', message: 'draft' }], head: 'head', wipCount: 2 })
  assert.deepEqual(prepared.map((commit) => commit.hash), [WIP_HASH, 'stash', 'head', 'root'])
  assert.deepEqual(prepared[1].parents, ['head'])
  assert.equal(prepared[1].stash.index, 0)
  assert.deepEqual(prepared[0].parents, ['head'])
  assert.equal(prepared[0].wip.count, 2)
  const graph = computeGraph(prepared)
  assert.equal(graph.nodes.find((node) => node.hash === WIP_HASH).lane, graph.nodes.find((node) => node.hash === 'head').lane)
  assert.deepEqual(prepareGraphCommits(commits.slice(3)).map((commit) => commit.hash), ['head', 'root'])
})

test('a pushed branch shows as one pill and the current branch leads', () => {
  const pills = groupRefs([
    { name: 'v1.0.0', type: 'tag' },
    { name: 'origin/feature/search', type: 'remote' },
    { name: 'feature/search', type: 'branch' },
    { name: 'origin/main', type: 'remote' },
    { name: 'main', type: 'head' },
  ])
  assert.deepEqual(pills.map((pill) => [pill.name, pill.type, pill.synced]), [
    ['main', 'head', ['origin/main']],
    ['feature/search', 'branch', ['origin/feature/search']],
    ['v1.0.0', 'tag', []],
  ])
  assert.deepEqual(groupRefs([{ name: 'origin/other', type: 'remote' }]).map((pill) => pill.type), ['remote'])
})

test('a branch highlights only the commits it adds beyond the current branch', () => {
  const nodes = [
    { hash: 'f2', parents: ['f1'] },
    { hash: 'm2', parents: ['m1'] },
    { hash: 'f1', parents: ['m1'] },
    { hash: 'm1', parents: ['root'] },
    { hash: 'root', parents: [] },
  ]
  assert.deepEqual([...branchOwnCommits(nodes, 'f2', 'm2')], ['f2', 'f1'])
  assert.deepEqual([...branchOwnCommits(nodes, 'm2', 'm2')], ['m2', 'm1', 'root'])
})

test('previews leave stashes out of the branch history', () => {
  const stashRepo = {
    head: 'head',
    currentBranch: 'main',
    stashes: [{ index: 0, hash: 'stash', message: 'draft' }],
    status: { staged: [{ path: 'a.txt' }] },
    commits: [
      { hash: 'stash', parents: ['head', 'index'], subject: 'On main: draft', refs: [] },
      { hash: 'index', parents: ['head'], subject: 'index on main: head', refs: [] },
      { hash: 'head', parents: ['root'], subject: 'Polish', refs: [{ name: 'main', type: 'head' }] },
      { hash: 'root', parents: [], subject: 'Start', refs: [] },
    ],
  }
  const preview = buildPreview(stashRepo, { type: 'commit', message: 'Next' })
  assert.deepEqual(preview.commits.slice(1).map((commit) => commit.hash), ['head', 'root'])
  assert.equal(preview.commits[0].ghost, true)
})
