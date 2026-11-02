// Parses a git remote URL into { host, owner, repo, isGitHub } and builds the
// GitHub "open a pull request" compare URL.

// True for github.com and GitHub Enterprise hosts (e.g. github.acme.com), but
// not hosts that merely contain the word, like "notgithub.io" or "mygithub.com".
function isGitHubHost(host) {
  return (host || '')
    .toLowerCase()
    .split('.')
    .includes('github')
}

function makeInfo(host, owner, repo) {
  return { host, owner, repo, isGitHub: isGitHubHost(host) }
}

export function parseGitHubRemote(url) {
  if (!url) return null
  let m
  // git@github.com:owner/repo(.git)
  m = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/)
  if (m) return makeInfo(m[1], m[2], m[3])
  // ssh://git@host/owner/repo(.git)
  m = url.match(/^ssh:\/\/(?:[^@]+@)?([^/]+)\/([^/]+)\/(.+?)(?:\.git)?$/)
  if (m) return makeInfo(m[1], m[2], m[3])
  // https://host/owner/repo(.git)
  m = url.match(/^https?:\/\/(?:[^@/]+@)?([^/]+)\/([^/]+)\/(.+?)(?:\.git)?\/?$/)
  if (m) return makeInfo(m[1], m[2], m[3])
  return null
}

export function buildCompareUrl({ host, owner, repo, base, head, title, body }) {
  const params = new URLSearchParams({ expand: '1' })
  if (title) params.set('title', title)
  if (body) params.set('body', body)
  // Branch names may contain "/", which GitHub keeps literal in the path.
  const range = base ? `${base}...${head}` : head
  return `https://${host}/${owner}/${repo}/compare/${range}?${params.toString()}`
}
