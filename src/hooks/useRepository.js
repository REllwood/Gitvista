import { useCallback, useEffect, useRef, useState } from 'react'
import { normaliseRecentRepos, touchRecentRepo } from '../lib/recentRepos'
import { call, normaliseSession, readSaved } from '../lib/repositorySession'

const basename = (path) => path.replace(/[/\\]+$/, '').split(/[/\\]/).pop()
const emptySession = { selectedHash: null, rightTab: 'details', message: '', coAuthors: [] }
const sessionKey = (path) => `gitvista:workspace:${path}`

// Owns repository loading, watching and saved workspace state. A generation
// invalidates reads when a tab changes; background refreshes share one request.
export default function useRepository(toast, busyRef) {
  const [tabs, setTabs] = useState(() => window.api
    ? normaliseRecentRepos(readSaved('gitvista:tabs', []), 50).map((path) => ({ path, name: basename(path) })) : [])
  const [recentRepos, setRecentRepos] = useState(() => normaliseRecentRepos(readSaved('gitvista:recentRepos', [])))
  const [repo, setRepo] = useState(null)
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState(emptySession)
  const [selectedCommitOverride, setSelectedCommitOverride] = useState(null)
  const currentPath = useRef(null)
  const generation = useRef(0)
  const opening = useRef(false)
  const pendingRefresh = useRef(null)
  const storageWarning = useRef(false)
  const repoPath = repo?.path || null

  const save = useCallback((key, value) => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      if (!storageWarning.current) toast('error', 'Workspace preferences could not be saved. Keep a copy of your commit message before closing GitVista.')
      storageWarning.current = true
    }
  }, [toast])

  useEffect(() => { save('gitvista:tabs', tabs.map((tab) => tab.path)) }, [tabs, save])
  useEffect(() => { save('gitvista:recentRepos', recentRepos) }, [recentRepos, save])
  useEffect(() => {
    if (repoPath) {
      save(sessionKey(repoPath), session)
      save('gitvista:activeRepository', repoPath)
    }
  }, [repoPath, session, save])

  const loadRepo = useCallback(async (dir) => {
    const request = ++generation.current
    opening.current = true
    setLoading(true)
    try {
      const data = await call(window.api.getRepoData(dir))
      if (request !== generation.current) return null
      currentPath.current = data.path
      setRepo(data)
      setSession(normaliseSession(readSaved(sessionKey(data.path), null), data))
      setSelectedCommitOverride(null)
      setRecentRepos((current) => touchRecentRepo(current, data.path))
      return data
    } catch (error) {
      if (request === generation.current) toast('error', error.message)
      return null
    } finally {
      if (request === generation.current) {
        opening.current = false
        setLoading(false)
      }
    }
  }, [toast])

  const refresh = useCallback(async (background = false) => {
    const path = currentPath.current
    if (!path || opening.current) return null
    if (background && pendingRefresh.current?.path === path) return pendingRefresh.current.promise
    const request = ++generation.current
    const promise = call(window.api.getRepoData(path)).then((data) => {
      if (request !== generation.current || currentPath.current !== path) return null
      setRepo(data)
      return data
    })
    pendingRefresh.current = { path, promise }
    try {
      return await promise
    } finally {
      if (pendingRefresh.current?.promise === promise) pendingRefresh.current = null
    }
  }, [])

  const openTab = useCallback(async (path) => {
    if (busyRef.current && opening.current) return false
    const data = await loadRepo(path)
    if (!data) return false
    setTabs((current) => {
      const other = current.filter((tab) => tab.path !== path && tab.path !== data.path)
      const existing = current.findIndex((tab) => tab.path === path || tab.path === data.path)
      other.splice(existing === -1 ? other.length : existing, 0, { path: data.path, name: data.name })
      return other
    })
    return true
  }, [loadRepo, busyRef])

  const switchTab = (path) => {
    if (!busyRef.current && !opening.current && path !== repoPath) openTab(path)
  }
  const closeTab = async (path) => {
    if (busyRef.current || opening.current) return
    const index = tabs.findIndex((tab) => tab.path === path)
    const next = tabs.filter((tab) => tab.path !== path)
    if (path === repoPath && next.length) {
      if (!(await loadRepo(next[Math.min(index, next.length - 1)].path))) return
    } else if (path === repoPath) {
      generation.current += 1
      currentPath.current = null
      setRepo(null)
      setSession(emptySession)
      setSelectedCommitOverride(null)
    }
    setTabs(next)
  }

  useEffect(() => {
    if (!window.api || !tabs.length) return undefined
    let alive = true
    const restoredTabs = tabs
    const restore = async () => {
      setLoading(true)
      const checks = await Promise.allSettled(restoredTabs.map(async (tab) => ({ tab, valid: await call(window.api.isGitRepo(tab.path)) })))
      if (!alive) return
      const valid = checks.filter((check) => check.status === 'fulfilled' && check.value.valid).map((check) => check.value.tab)
      setTabs(valid)
      const active = readSaved('gitvista:activeRepository', null) || localStorage.getItem('gitvista:active')
      if (valid.length) await openTab(valid.find((tab) => tab.path === active)?.path || valid[0].path)
      else setLoading(false)
    }
    restore().catch((error) => { if (alive) { setLoading(false); toast('error', error.message) } })
    return () => { alive = false }
    // Restore once; tab changes are handled by openTab and closeTab.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!repoPath || !window.api?.startRepositoryWatch) return undefined
    let alive = true
    let timer
    let retry
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        if (!alive) return
        if (busyRef.current || opening.current) { schedule(); return }
        refresh(true).catch((error) => { if (alive) toast('error', error.message) })
      }, 350)
    }
    const startWatch = () => call(window.api.startRepositoryWatch(repoPath)).catch((error) => {
      if (alive) toast('error', error.message)
    })
    const offChange = window.api.onRepositoryChanged?.((event) => { if (event.path === repoPath) schedule() })
    const offError = window.api.onRepositoryWatchError?.((event) => {
      if (event.path !== repoPath || !alive) return
      clearTimeout(retry)
      retry = setTimeout(() => { if (alive) startWatch() }, 3000)
    })
    window.addEventListener('focus', schedule)
    startWatch()
    return () => {
      alive = false
      clearTimeout(timer)
      clearTimeout(retry)
      offChange?.()
      offError?.()
      window.removeEventListener('focus', schedule)
      window.api.stopRepositoryWatch?.(repoPath).catch((error) => console.warn('Repository watch cleanup failed:', error.message))
    }
  }, [repoPath, refresh, busyRef, toast])

  const setField = (field) => (value) => setSession((current) => ({
    ...current, [field]: typeof value === 'function' ? value(current[field]) : value,
  }))

  return {
    repo, repoPath, tabs, recentRepos, setRecentRepos, loading, setLoading,
    refresh, openTab, switchTab, closeTab,
    selectedHash: session.selectedHash, setSelectedHash: setField('selectedHash'),
    rightTab: session.rightTab, setRightTab: setField('rightTab'),
    commitMessage: session.message, setCommitMessage: setField('message'),
    coAuthors: session.coAuthors, setCoAuthors: setField('coAuthors'),
    selectedCommitOverride, setSelectedCommitOverride,
  }
}
