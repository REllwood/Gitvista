const test = require('node:test')
const assert = require('node:assert/strict')

const { parseGitHubRemote, requestGitHub } = require('../../electron/github.cjs')

test('GitHub remote parsing accepts canonical HTTPS and SSH forms only', () => {
  assert.deepEqual(parseGitHubRemote('git@github.com:owner/repository.git'), { owner: 'owner', repo: 'repository' })
  assert.deepEqual(parseGitHubRemote('https://github.com/owner/repository.git'), { owner: 'owner', repo: 'repository' })
  assert.equal(parseGitHubRemote('https://github.com.example/owner/repository.git'), null)
  assert.equal(parseGitHubRemote('file:///github.com/owner/repository.git'), null)
})

test('GitHub requests use versioned JSON headers and keep credentials in the main process', async () => {
  let captured = null
  const data = await requestGitHub('/repos/owner/repository/pulls/7/merge', {
    method: 'PUT',
    token: 'secret-token',
    body: { merge_method: 'squash', sha: 'abc123' },
    fetchImpl: async (url, options) => {
      captured = { url, options }
      return { ok: true, status: 200, json: async () => ({ merged: true }) }
    },
  })

  assert.deepEqual(data, { merged: true })
  assert.equal(captured.url, 'https://api.github.com/repos/owner/repository/pulls/7/merge')
  assert.equal(captured.options.headers.Authorization, 'Bearer secret-token')
  assert.equal(captured.options.headers['X-GitHub-Api-Version'], '2026-03-10')
  assert.deepEqual(JSON.parse(captured.options.body), { merge_method: 'squash', sha: 'abc123' })
})

test('GitHub API errors do not include the saved credential', async () => {
  await assert.rejects(
    () => requestGitHub('/user', {
      token: 'must-not-leak',
      fetchImpl: async () => ({ ok: false, status: 401, json: async () => ({ message: 'Bad credentials' }) }),
    }),
    (error) => /replace it in Settings/i.test(error.message) && !error.message.includes('must-not-leak')
  )
})

test('GitHub network failures are replaced with actionable errors', async () => {
  await assert.rejects(
    () => requestGitHub('/user', {
      token: 'must-not-leak',
      fetchImpl: async () => {
        throw new TypeError('fetch failed with must-not-leak')
      },
    }),
    (error) => /could not be reached/i.test(error.message) && !error.message.includes('must-not-leak')
  )
})
