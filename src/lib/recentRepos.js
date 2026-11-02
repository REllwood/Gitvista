export function normaliseRecentRepos(value, limit = 10) {
  if (!Array.isArray(value)) return []
  const seen = new Set()
  const result = []
  for (const candidate of value) {
    if (typeof candidate !== 'string') continue
    const path = candidate.trim()
    if (!path || seen.has(path)) continue
    seen.add(path)
    result.push(path)
    if (result.length >= limit) break
  }
  return result
}

export function touchRecentRepo(current, path, limit = 10) {
  return normaliseRecentRepos([path, ...(current || [])], limit)
}
