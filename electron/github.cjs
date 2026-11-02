const { spawn } = require('child_process')
const simpleGit = require('simple-git')

const API_ROOT = 'https://api.github.com'
const API_VERSION = '2026-03-10'

function parseGitHubRemote(value) {
  const remote = (value || '').trim()
  let match = remote.match(/^git@github\.com:([^/]+)\/(.+?)(?:\.git)?$/i)
  if (!match) match = remote.match(/^(?:https?|ssh):\/\/(?:git@)?github\.com\/([^/]+)\/(.+?)(?:\.git)?\/?$/i)
  if (!match) return null
  const owner = match[1]
  const repo = match[2].replace(/\.git$/i, '')
  if (!/^[A-Za-z0-9_.-]+$/.test(owner) || !/^[A-Za-z0-9_.-]+$/.test(repo)) return null
  return { owner, repo }
}

async function resolveRepository(repoPath) {
  const remotes = await simpleGit({ baseDir: repoPath, binary: 'git' }).getRemotes(true)
  const ordered = [...remotes].sort((a, b) => (a.name === 'origin' ? -1 : b.name === 'origin' ? 1 : 0))
  for (const remote of ordered) {
    const parsed = parseGitHubRemote(remote.refs.fetch || remote.refs.push)
    if (parsed) return { ...parsed, remote: remote.name }
  }
  throw new Error('This repository does not have a github.com remote.')
}

async function readGitHubCredential() {
  return new Promise((resolve) => {
    const child = spawn('git', ['credential', 'fill'], {
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    let output = ''
    let settled = false
    const finish = (credential) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(credential)
    }
    const timeout = setTimeout(() => {
      child.kill()
      finish(null)
    }, 5000)
    child.stdout.on('data', (chunk) => {
      if (output.length < 20_000) output += chunk.toString()
    })
    child.on('error', () => finish(null))
    child.on('close', (code) => {
      if (code !== 0) return finish(null)
      const fields = Object.fromEntries(
        output
          .split('\n')
          .map((line) => line.split('='))
          .filter((parts) => parts.length >= 2)
          .map(([key, ...rest]) => [key, rest.join('=')])
      )
      finish(fields.password ? { username: fields.username || '', token: fields.password } : null)
    })
    child.stdin.end('protocol=https\nhost=github.com\n\n')
  })
}

function safeAvatar(value) {
  try {
    const url = new URL(value)
    const allowed = url.hostname === 'github.com' || url.hostname.endsWith('.githubusercontent.com')
    return url.protocol === 'https:' && allowed ? url.toString() : ''
  } catch {
    return ''
  }
}

function safeColour(value) {
  return /^[0-9a-f]{6}$/i.test(value || '') ? `#${value}` : ''
}

async function requestGitHub(route, { method = 'GET', body, token, fetchImpl = globalThis.fetch } = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('GitHub networking is unavailable in this build.')
  let response
  try {
    response = await fetchImpl(`${API_ROOT}${route}`, {
      method,
      headers: {
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'GitVista',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError') {
      throw new Error('GitHub took too long to respond. Check your connection and try again.')
    }
    throw new Error('GitHub could not be reached. Check your connection and try again.')
  }
  if (response.status === 204) return null
  let data = null
  try {
    data = await response.json()
  } catch {
    data = null
  }
  if (!response.ok) {
    if (response.status === 401) throw new Error('GitHub rejected the saved token. Replace it in Settings and try again.')
    if (response.status === 403 && !token) throw new Error('GitHub’s public API limit was reached. Save a GitHub token in Settings and try again.')
    const message = typeof data?.message === 'string' ? data.message.slice(0, 500) : `GitHub returned HTTP ${response.status}.`
    throw new Error(message)
  }
  return data
}

function pullSummary(pull) {
  return {
    number: pull.number,
    title: pull.title || '',
    body: pull.body || '',
    draft: !!pull.draft,
    state: pull.state || '',
    createdAt: pull.created_at || '',
    updatedAt: pull.updated_at || '',
    htmlUrl: pull.html_url || '',
    author: {
      login: pull.user?.login || '',
      avatarUrl: safeAvatar(pull.user?.avatar_url),
    },
    head: { ref: pull.head?.ref || '', sha: pull.head?.sha || '', label: pull.head?.label || '' },
    base: { ref: pull.base?.ref || '', sha: pull.base?.sha || '', label: pull.base?.label || '' },
    labels: (pull.labels || []).slice(0, 20).map((label) => ({ name: label.name || '', colour: safeColour(label.color) })),
  }
}

async function listPullRequests(repoPath) {
  const repository = await resolveRepository(repoPath)
  const credential = await readGitHubCredential()
  const pulls = await requestGitHub(`/repos/${repository.owner}/${repository.repo}/pulls?state=open&sort=updated&direction=desc&per_page=50`, {
    token: credential?.token,
  })
  return {
    repository,
    authenticated: !!credential?.token,
    pulls: (pulls || []).map(pullSummary),
  }
}

async function listIssues(repoPath) {
  const repository = await resolveRepository(repoPath)
  const credential = await readGitHubCredential()
  const issues = await requestGitHub(`/repos/${repository.owner}/${repository.repo}/issues?state=open&sort=updated&direction=desc&per_page=50`, {
    token: credential?.token,
  })
  return {
    authenticated: !!credential?.token,
    issues: (issues || [])
      .filter((issue) => !issue.pull_request)
      .map((issue) => ({
        number: issue.number,
        title: issue.title || '',
        body: issue.body || '',
        comments: issue.comments || 0,
        updatedAt: issue.updated_at || '',
        htmlUrl: issue.html_url || '',
        author: { login: issue.user?.login || '', avatarUrl: safeAvatar(issue.user?.avatar_url) },
        labels: (issue.labels || []).slice(0, 20).map((label) => ({ name: label.name || '', colour: safeColour(label.color) })),
      })),
  }
}

async function getPullRequest(repoPath, pullNumber) {
  const repository = await resolveRepository(repoPath)
  const credential = await readGitHubCredential()
  const token = credential?.token
  const base = `/repos/${repository.owner}/${repository.repo}`
  const pull = await requestGitHub(`${base}/pulls/${pullNumber}`, { token })
  const [statusResult, checksResult, reviewsResult] = await Promise.allSettled([
    requestGitHub(`${base}/commits/${pull.head.sha}/status`, { token }),
    requestGitHub(`${base}/commits/${pull.head.sha}/check-runs?per_page=100`, { token }),
    requestGitHub(`${base}/pulls/${pullNumber}/reviews?per_page=100`, { token }),
  ])
  const status = statusResult.status === 'fulfilled' ? statusResult.value : null
  const checks = checksResult.status === 'fulfilled' ? checksResult.value?.check_runs || [] : []
  const reviews = reviewsResult.status === 'fulfilled' ? reviewsResult.value || [] : []
  const failedChecks = checks.filter((check) => ['failure', 'cancelled', 'timed_out', 'action_required'].includes(check.conclusion))
  const pendingChecks = checks.filter((check) => !check.completed_at || !check.conclusion)
  const statusState = status?.state || 'none'
  const statusFailed = statusState === 'failure' || statusState === 'error'
  const statusPending = statusState === 'pending'

  return {
    ...pullSummary(pull),
    authenticated: !!token,
    mergeable: pull.mergeable,
    mergeableState: pull.mergeable_state || '',
    additions: pull.additions || 0,
    deletions: pull.deletions || 0,
    changedFiles: pull.changed_files || 0,
    commits: pull.commits || 0,
    comments: (pull.comments || 0) + (pull.review_comments || 0),
    ci: {
      state: failedChecks.length || statusFailed
        ? 'failure'
        : pendingChecks.length || statusPending
          ? 'pending'
          : checks.length || statusState === 'success'
            ? 'success'
            : 'none',
      total: checks.length + (Array.isArray(status?.statuses) ? status.statuses.length : status?.total_count || 0),
      failed: failedChecks.length + (statusFailed ? 1 : 0),
      pending: pendingChecks.length + (statusPending ? 1 : 0),
    },
    reviews: reviews.slice(-30).map((review) => ({
      id: review.id,
      state: review.state || '',
      body: review.body || '',
      submittedAt: review.submitted_at || '',
      author: { login: review.user?.login || '', avatarUrl: safeAvatar(review.user?.avatar_url) },
    })),
  }
}

async function mergePullRequest(repoPath, pullNumber, method, expectedSha) {
  const repository = await resolveRepository(repoPath)
  const credential = await readGitHubCredential()
  if (!credential?.token) throw new Error('Save a GitHub token in Settings before merging a pull request.')
  const result = await requestGitHub(`/repos/${repository.owner}/${repository.repo}/pulls/${pullNumber}/merge`, {
    method: 'PUT',
    token: credential.token,
    body: { merge_method: method, sha: expectedSha },
  })
  if (!result?.merged) throw new Error(result?.message || 'GitHub did not merge this pull request.')
  return { merged: true, sha: result.sha || '', message: result.message || '' }
}

async function createReview(repoPath, pullNumber, event, body, commitId) {
  const repository = await resolveRepository(repoPath)
  const credential = await readGitHubCredential()
  if (!credential?.token) throw new Error('Save a GitHub token in Settings before submitting a review.')
  const result = await requestGitHub(`/repos/${repository.owner}/${repository.repo}/pulls/${pullNumber}/reviews`, {
    method: 'POST',
    token: credential.token,
    body: { event, ...(body ? { body } : {}), commit_id: commitId },
  })
  return { id: result.id, state: result.state || '', submittedAt: result.submitted_at || '' }
}

module.exports = {
  parseGitHubRemote,
  requestGitHub,
  listPullRequests,
  listIssues,
  getPullRequest,
  mergePullRequest,
  createReview,
}
