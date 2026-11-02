import { normaliseCoAuthor } from './commitMessage.js'

export function changedFileCount(status = {}) {
  return new Set([...(status.staged || []), ...(status.unstaged || []), ...(status.untracked || [])].map((file) => file.path)).size
}

export function normaliseSession(value, repo) {
  const saved = value && typeof value === 'object' ? value : {}
  const selected = repo.commits.some((commit) => commit.hash === saved.selectedHash) ? saved.selectedHash : repo.head
  return {
    selectedHash: selected || null,
    rightTab: ['changes', 'details'].includes(saved.rightTab) ? saved.rightTab : repo.status.clean ? 'details' : 'changes',
    message: typeof saved.message === 'string' ? saved.message : '',
    coAuthors: Array.isArray(saved.coAuthors) ? saved.coAuthors.map(normaliseCoAuthor).filter(Boolean) : [],
  }
}

export async function call(promise) {
  const result = await promise
  if (!result?.ok) throw new Error(result?.error || 'GitVista could not complete this request.')
  return result.data
}

export function readSaved(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}
