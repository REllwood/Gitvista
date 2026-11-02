import ModalOverlay from './components/ModalOverlay'
import { useEffect, useState, useCallback, useRef } from 'react'
import Toolbar from './components/Toolbar'
import StatusBar from './components/StatusBar'
import Sidebar from './components/Sidebar'
import GraphView from './components/GraphView'
import CommitDetails from './components/CommitDetails'
import StagingPanel from './components/StagingPanel'
import ActionModal from './components/ActionModal'
import WelcomeScreen from './components/WelcomeScreen'
import HelpPanel from './components/HelpPanel'
import HistoryPanel from './components/HistoryPanel'
import Toasts from './components/Toasts'
import DiffModal from './components/DiffModal'
import ContextMenu from './components/ContextMenu'
import ConflictPanel, { ConflictBanner } from './components/ConflictPanel'
import TabBar from './components/TabBar'
import PRModal from './components/PRModal'
import CloneModal from './components/CloneModal'
import SettingsModal from './components/SettingsModal'
import RemoteModal from './components/RemoteModal'
import CompareModal from './components/CompareModal'
import InteractiveRebaseModal from './components/InteractiveRebaseModal'
import ActivityPanel from './components/ActivityPanel'
import FileInspectorPanel from './components/FileInspectorPanel'
import CommandPalette from './components/CommandPalette'
import BranchTrackingModal from './components/BranchTrackingModal'
import WorktreeModal from './components/WorktreeModal'
import GitHubPanel from './components/GitHubPanel'
import { HelpContext } from './lib/helpContext'
import { parseGitHubRemote } from './lib/github'
import { appendCoAuthors } from './lib/commitMessage'
import { call, changedFileCount } from './lib/repositorySession'
import useRepository from './hooks/useRepository'
import { executeGitAction, successMessage } from './lib/gitActions'

const basename = (p) => (p || '').replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() || p

const hasApi = typeof window !== 'undefined' && !!window.api
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
const modKey = isMac ? '⌘' : 'Ctrl+'
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value))

function savedNumber(key, fallback, minimum, maximum) {
  if (typeof localStorage === 'undefined') return fallback
  const value = Number.parseInt(localStorage.getItem(key) || '', 10)
  return Number.isFinite(value) ? clamp(value, minimum, maximum) : fallback
}

function headHash(data) {
  for (const c of data?.commits || []) {
    for (const r of c.refs || []) {
      if (r.type === 'head' || r.type === 'detached') return c.hash
    }
  }
  return data?.head || null
}

export default function App() {
  const [openingRecent, setOpeningRecent] = useState(null)
  const [busy, setBusyState] = useState(false)
  const [commitBusy, setCommitBusy] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('gitvista:theme') || 'system')
  const [sidebarWidth, setSidebarWidth] = useState(() => savedNumber('gitvista:sidebarWidth', 224, 190, 420))
  const [rightPanelWidth, setRightPanelWidth] = useState(() => savedNumber('gitvista:rightPanelWidth', 360, 290, 620))
  const [updateStatus, setUpdateStatus] = useState({ state: 'idle' })
  const [activities, setActivities] = useState([])
  const [activityOpen, setActivityOpen] = useState(false)
  const [fileInspector, setFileInspector] = useState(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [prOpen, setPrOpen] = useState(false)
  const [githubOpen, setGitHubOpen] = useState(false)

  const [action, setAction] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [initPrompt, setInitPrompt] = useState(null)
  const [cloneOpen, setCloneOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [remoteModalOpen, setRemoteModalOpen] = useState(false)
  const [trackingBranch, setTrackingBranch] = useState(null)
  const [worktreeOpen, setWorktreeOpen] = useState(false)
  const [compareState, setCompareState] = useState(null)
  const [compareBase, setCompareBase] = useState(null)
  const [irebaseState, setIrebaseState] = useState(null)

  const [helpOpen, setHelpOpen] = useState(false)
  const [helpTerm, setHelpTerm] = useState(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [reflog, setReflog] = useState([])

  const [diffState, setDiffState] = useState(null)
  const diffRequest = useRef(0)
  const busyRef = useRef(false)
  const shortcutHandler = useRef(null)
  const setBusy = useCallback((value) => { busyRef.current = value; setBusyState(value) }, [])
  const [menu, setMenu] = useState(null)

  const [toasts, setToasts] = useState([])

  const toast = useCallback((kind, text) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === 'error' ? 7000 : 4000)
  }, [])
  const dismissToast = (id) => setToasts((t) => t.filter((x) => x.id !== id))
  const { repo, repoPath, tabs, recentRepos, setRecentRepos, loading, setLoading,
    refresh, openTab, switchTab, closeTab, selectedHash, setSelectedHash,
    rightTab, setRightTab, commitMessage, setCommitMessage, coAuthors, setCoAuthors,
    selectedCommitOverride, setSelectedCommitOverride } = useRepository(toast, busyRef)


  useEffect(() => {
    if (!hasApi || !window.api.onUpdaterStatus) return undefined
    let alive = true
    window.api.getUpdaterStatus?.()
      .then((result) => {
        if (alive && result?.ok && result.data) setUpdateStatus(result.data)
      })
      .catch(() => {
        if (alive) setUpdateStatus({ state: 'error', message: 'Update status is unavailable.' })
      })
    const unsubscribe = window.api.onUpdaterStatus((status) => {
      if (alive && status) setUpdateStatus(status)
    })
    return () => {
      alive = false
      unsubscribe?.()
    }
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)')
    const applyTheme = () => {
      document.documentElement.dataset.theme = theme === 'system' ? (media.matches ? 'light' : 'dark') : theme
      document.documentElement.style.colorScheme = document.documentElement.dataset.theme
    }
    applyTheme()
    media.addEventListener('change', applyTheme)
    localStorage.setItem('gitvista:theme', theme)
    return () => media.removeEventListener('change', applyTheme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem('gitvista:sidebarWidth', String(sidebarWidth))
  }, [sidebarWidth])

  useEffect(() => {
    localStorage.setItem('gitvista:rightPanelWidth', String(rightPanelWidth))
  }, [rightPanelWidth])

  useEffect(() => {
    if (!hasApi || !window.api.onOperationStatus) return undefined
    return window.api.onOperationStatus((activity) => {
      if (!activity?.id) return
      setActivities((current) => {
        const existing = current.findIndex((item) => item.id === activity.id)
        const next =
          existing === -1
            ? [activity, ...current]
            : current.map((item, index) => (index === existing ? activity : item))
        return next.slice(0, 50)
      })
    })
  }, [])

  useEffect(() => {
    diffRequest.current += 1
    setDiffState(null)
    setAction(null)
    setConfirm(null)
    setCompareState(null)
    setCompareBase(null)
    setIrebaseState(null)
    setFileInspector(null)
    setMenu(null)
    setTrackingBranch(null)
    setHistoryOpen(false)
    setGitHubOpen(false)
  }, [repoPath])

  const openHelp = useCallback((term) => {
    setHelpTerm(typeof term === 'string' ? term : null)
    setHelpOpen(true)
  }, [])

  // ---- history / reflog / undo ----
  async function openHistory() {
    if (busyRef.current) return
    if (!repoPath) return
    setBusy(true)
    try {
      setReflog(await call(window.api.getReflog(repoPath)))
    } catch (error) {
      setReflog([])
      toast('error', error?.message || 'History could not be loaded.')
    } finally {
      setBusy(false)
    }
    setHistoryOpen(true)
  }
  const onRestore = (entry) => {
    setHistoryOpen(false)
    setAction({ type: 'restore', hash: entry.hash, subject: entry.subject })
  }
  async function undoLast() {
    if (busyRef.current) return
    if (!repoPath) return
    // The backend works out the correct undo for the last operation's type: a
    // switch is undone by switching back (a reset would move the wrong branch);
    // a rebase via ORIG_HEAD; everything else by returning to the prior commit.
    let target = null
    setBusy(true)
    try {
      target = await call(window.api.getUndoTarget(repoPath))
    } catch (error) {
      toast('error', error?.message || 'Undo information could not be loaded.')
    } finally {
      setBusy(false)
    }
    if (!target) {
      toast('info', 'There’s nothing to undo yet.')
      return
    }
    if (target.kind === 'checkout') setAction({ type: 'checkout', ref: target.ref })
    else setAction({ type: 'restore', hash: target.hash, subject: target.label })
  }

  // ---- repo open / sandbox ----
  async function openRepo() {
    try {
      setLoading(true)
      const res = await window.api.chooseRepo()
      if (!res || !res.ok) {
        if (res?.error) toast('error', res.error)
        return
      }
      const dir = res.data
      if (!dir) return
      setLoading(true)
      const isRepo = await window.api.isGitRepo(dir)
      if (!isRepo?.ok) throw new Error(isRepo?.error || 'The selected folder could not be checked.')
      if (isRepo.data) await openTab(dir)
      else setInitPrompt(dir)
    } catch (error) {
      toast('error', error?.message || 'The selected folder could not be opened.')
    } finally {
      setLoading(false)
    }
  }

  async function doInit(dir) {
    if (busyRef.current) return
    setInitPrompt(null)
    setBusy(true)
    try {
      await call(window.api.initRepo(dir))
      toast('success', 'New Git repository created.')
      await openTab(dir)
    } catch (error) {
      toast('error', error?.message || 'The repository could not be initialised.')
    } finally {
      setBusy(false)
    }
  }

  async function manualRefresh() {
    setLoading(true)
    try {
      await refresh()
    } catch (error) {
      toast('error', error?.message || 'The repository could not be refreshed.')
    } finally {
      setLoading(false)
    }
  }

  function beginPanelResize(panel, event) {
    if (event.button !== 0) return
    event.preventDefault()
    const startX = event.clientX
    const startWidth = panel === 'sidebar' ? sidebarWidth : rightPanelWidth
    const setWidth = panel === 'sidebar' ? setSidebarWidth : setRightPanelWidth
    const minimum = panel === 'sidebar' ? 190 : 290
    const maximum = panel === 'sidebar' ? 420 : 620
    document.body.classList.add('panel-resizing')
    const onMove = (moveEvent) => {
      const delta = moveEvent.clientX - startX
      setWidth(clamp(startWidth + (panel === 'sidebar' ? delta : -delta), minimum, maximum))
    }
    const onUp = () => {
      document.body.classList.remove('panel-resizing')
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function resizePanelWithKeyboard(panel, event) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const direction = event.key === 'ArrowRight' ? 1 : -1
    if (panel === 'sidebar') setSidebarWidth((width) => clamp(width + direction * 12, 190, 420))
    else setRightPanelWidth((width) => clamp(width - direction * 12, 290, 620))
  }

  async function openSandbox() {
    if (busyRef.current) return
    setBusy(true)
    try {
      const path = await call(window.api.createSandbox())
      const opened = await openTab(path)
      if (opened) toast('info', 'Opened your learning sandbox — experiment freely, nothing here can break real work.')
    } catch (error) {
      toast('error', error?.message || 'The learning sandbox could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  async function openRecentRepository(path) {
    setOpeningRecent(path)
    try {
      await openTab(path)
    } finally {
      setOpeningRecent(null)
    }
  }

  // ---- create pull request ----
  async function createPR({ url, needsPush }) {
    if (busyRef.current) return
    setBusy(true)
    let err = null
    try {
      if (needsPush) await call(window.api.push(repoPath))
      await call(window.api.openExternal(url))
    } catch (e) {
      err = e.message
    }
    setBusy(false)
    setPrOpen(false)
    await refreshAfterOperation()
    if (err) toast('error', err)
    else toast('info', 'Opened GitHub to finish creating your pull request.')
  }

  function confirmInstallUpdate() {
    setConfirm({
      title: 'Restart and install the update?',
      body: 'GitVista will close, install the downloaded update, and reopen. Finish any in-progress Git operation first.',
      confirmLabel: 'Restart and update',
      onYes: async () => {
        if (busyRef.current) return
        setConfirm(null)
        setBusy(true)
        try {
          await call(window.api.installUpdate())
        } catch (error) {
          setBusy(false)
          toast('error', error?.message || 'The update could not be installed.')
        }
      },
    })
  }

  // ---- clone ----
  async function chooseCloneDir() {
    try {
      return await call(window.api.chooseDirectory('Choose where to clone the repository'))
    } catch (error) {
      toast('error', error?.message || 'The destination folder could not be chosen.')
      return null
    }
  }
  async function doClone({ url, dir, name }) {
    if (busyRef.current) return
    setBusy(true)
    let dest = null
    let err = null
    try {
      dest = await call(window.api.clone(dir, url, name))
    } catch (e) {
      err = e.message
    }
    setBusy(false)
    if (dest) {
      setCloneOpen(false)
      toast('success', 'Cloned successfully.')
      openTab(dest)
    } else {
      toast('error', err || 'Clone failed.')
    }
  }

  async function refreshAfterOperation() {
    try {
      return await refresh()
    } catch (error) {
      toast('error', `The operation finished, but the repository could not be refreshed: ${error.message}`)
      return null
    }
  }

  // ---- selection ----
  const onSelectCommit = (h, commit) => {
    setSelectedHash(h)
    setSelectedCommitOverride(repo?.commits?.some((item) => item.hash === h) ? null : commit || null)
    setRightTab('details')
  }
  const onSelectWip = () => {
    setSelectedCommitOverride(null)
    setRightTab('changes')
  }

  // ---- file/staging ops ----
  async function fileOp(fn) {
    if (busyRef.current) return
    setBusy(true)
    try {
      await call(fn())
    } catch (e) {
      toast('error', e.message)
    } finally {
      await refreshAfterOperation()
      setBusy(false)
    }
  }

  const onStage = (f) => fileOp(() => window.api.stageFile(repoPath, f.path))
  const onUnstage = (f) => fileOp(() => window.api.unstageFile(repoPath, f.path))
  const onStageAll = () => fileOp(() => window.api.stageAll(repoPath))
  const onUnstageAll = () => fileOp(() => window.api.unstageAll(repoPath))
  const onDiscard = (f) =>
    setConfirm({
      title: `Discard changes to ${f.path}?`,
      body: 'This permanently throws away your edits to this file. It cannot be undone.',
      danger: true,
      confirmLabel: 'Discard changes',
      onYes: () => {
        setConfirm(null)
        fileOp(() => window.api.discardFile(repoPath, f.path))
      },
    })

  async function doCommit() {
    if (busyRef.current) return
    setCommitBusy(true)
    setBusy(true)
    let ok = false
    let err = null
    try {
      await call(window.api.commit(repoPath, appendCoAuthors(commitMessage, coAuthors)))
      ok = true
    } catch (e) {
      err = e.message
    }
    const data = await refreshAfterOperation()
    setCommitBusy(false)
    setBusy(false)
    if (ok) {
      setCommitMessage('')
      setCoAuthors([])
      toast('success', 'Snapshot saved as a new commit.')
      if (data) {
        const h = headHash(data)
        if (h) {
          setSelectedHash(h)
          setRightTab('details')
        }
      }
    } else if (/tell me who you are|empty ident|auto-detect email|user\.(name|email)|no name was given/i.test(err || '')) {
      toast('error', 'Set your name & email in Settings before your first commit.')
      setSettingsOpen(true)
    } else {
      toast('error', err || 'Could not commit.')
    }
  }

  // ---- actions via modal ----
  async function runAction(a) {
    if (busyRef.current) return
    setBusy(true)
    let ok = false
    let errMsg = null
    try {
      await executeGitAction(window.api, repoPath, a)
      ok = true
    } catch (e) {
      errMsg = e.message
    }
    const data = await refreshAfterOperation()
    setBusy(false)
    setAction(null)
    if (data?.conflict?.inProgress) {
      toast('info', `This caused conflicts. Resolve the highlighted files on the right, then finish the ${data.conflict.inProgress}.`)
    } else if (ok) {
      toast('success', successMessage(a))
    } else if (a.type === 'push' && /\brejected\b|non-fast-forward|fetch first|tip of your current branch is behind|behind its remote/i.test(errMsg || '')) {
      // Review remote changes before considering a destructive push.
      toast('error', 'Your push was rejected because the remote has newer commits. Fetch and review those changes before pushing again.')
    } else {
      toast('error', errMsg || 'Something went wrong.')
    }
  }

  // ---- conflict resolution ----
  async function runConflict(kind) {
    if (busyRef.current) return
    const op = repo?.conflict?.inProgress
    setBusy(true)
    let ok = false
    let err = null
    try {
      if (kind === 'abort') await call(window.api.abortOperation(repoPath, op))
      else await call(window.api.continueOperation(repoPath, op))
      ok = true
    } catch (e) {
      err = e.message
    }
    const data = await refreshAfterOperation()
    setBusy(false)
    if (ok) {
      toast('success', kind === 'abort' ? `Aborted the ${op}.` : `Finished the ${op}.`)
      if (kind !== 'abort' && data) {
        const h = headHash(data)
        if (h) {
          setSelectedHash(h)
          setRightTab('details')
        }
      }
    } else {
      toast('error', err || 'Could not complete that.')
    }
  }
  const onResolve = (file, side) => fileOp(() => window.api.resolveUsing(repoPath, file, side))
  const onMarkResolved = (file) => fileOp(() => window.api.markResolved(repoPath, file))
  const onOpenFile = async (file) => {
    if (busyRef.current) return
    setBusy(true)
    try {
      await call(window.api.openRepoFile(repoPath, file))
    } catch (error) {
      toast('error', error?.message || 'The file could not be opened.')
    } finally {
      setBusy(false)
    }
  }

  // ---- diff viewing ----
  async function loadDiff(initialState, request) {
    const requestId = ++diffRequest.current
    setDiffState({ ...initialState, loading: true, content: '', error: null })
    try {
      const content = await call(request())
      if (requestId === diffRequest.current) {
        setDiffState({ ...initialState, loading: false, content, error: null })
      }
    } catch (error) {
      if (requestId === diffRequest.current) {
        setDiffState({
          ...initialState,
          loading: false,
          content: '',
          error: error?.message || 'GitVista could not load this file comparison.',
        })
      }
    }
  }

  function openDiff(file, staged, untracked = false) {
    const fileName = typeof file === 'string' ? file : file?.path
    if (!fileName) {
      toast('error', 'GitVista could not identify the file to compare.')
      return Promise.resolve()
    }
    return loadDiff(
      { fileName, kind: 'diff', interactive: !untracked, staged: !!staged, untracked },
      () => window.api.getFileDiff(repoPath, fileName, !!staged)
    )
  }

  async function changeHunk(patch, staged) {
    if (busyRef.current) return
    const state = diffState
    setBusy(true)
    try {
      await call((staged ? window.api.unstageHunk : window.api.stageHunk)(repoPath, patch))
      await refreshAfterOperation()
      if (state) await openDiff(state.fileName, state.staged)
    } catch (error) {
      toast('error', error.message)
    } finally {
      setBusy(false)
    }
  }
  const onStageHunkOp = (patch) => changeHunk(patch, false)
  const onUnstageHunkOp = (patch) => changeHunk(patch, true)
  function openCommitDiff(file, hash, previousPath = null) {
    return loadDiff(
      { fileName: file, previousPath, kind: 'diff', hash },
      () => window.api.getCommitFileDiff(repoPath, hash, file, previousPath)
    )
  }
  function openConflictView(file) {
    return loadDiff(
      { fileName: file, kind: 'conflict' },
      () => window.api.getFileContent(repoPath, file)
    )
  }
  function retryDiff() {
    if (!diffState) return
    if (diffState.kind === 'conflict') openConflictView(diffState.fileName)
    else if (diffState.hash) openCommitDiff(diffState.fileName, diffState.hash, diffState.previousPath)
    else openDiff(diffState.fileName, diffState.staged, diffState.untracked)
  }
  function closeDiff() {
    diffRequest.current += 1
    setDiffState(null)
  }

  // ---- commit-level actions (context menu + detail buttons) ----
  async function commitAction(type, node) {
    if (busyRef.current) return
    const base = { hash: node.hash, subject: node.subject }
    if (type === 'switch') setAction({ type: 'checkout', ref: node.hash })
    else if (type === 'branchAt') setAction({ type: 'branchAt', ...base })
    else if (type === 'tag') setAction({ type: 'tag', ...base })
    else if (type === 'cherryPick') setAction({ type: 'cherryPick', ...base })
    else if (type === 'revert') setAction({ type: 'revert', ...base })
    else if (type === 'uncommit') setAction({ type: 'uncommit' })
    else if (type === 'amend') {
      setBusy(true)
      try {
        const info = await call(window.api.getCommitFiles(repoPath, node.hash))
        setAction({ type: 'amend', message: info.body })
      } catch (error) {
        toast('error', error.message)
      } finally {
        setBusy(false)
      }
    }
    else if (type === 'reset-soft') setAction({ type: 'reset', mode: 'soft', ...base })
    else if (type === 'reset-mixed') setAction({ type: 'reset', mode: 'mixed', ...base })
    else if (type === 'reset-hard') setAction({ type: 'reset', mode: 'hard', ...base })
    else if (type === 'copy') {
      setBusy(true)
      try {
        await call(window.api.writeClipboardText(node.hash))
        toast('info', 'Commit ID copied to clipboard.')
      } catch (error) {
        toast('error', error?.message || 'The commit ID could not be copied.')
      } finally {
        setBusy(false)
      }
    }
  }

  // ---- compare two points in history ----
  const shorth = (h) => (h || '').slice(0, 7)
  const onCompareWithHead = (node) =>
    setCompareState({ a: node.hash, b: 'HEAD', aLabel: shorth(node.hash), bLabel: repo?.currentBranch || 'HEAD' })
  const onSetCompareBase = (node) => {
    setCompareBase(node.hash)
    toast('info', `Compare base set to ${shorth(node.hash)} — right-click another commit and choose “Compare with base”.`)
  }
  const onCompareWithBase = (node) =>
    setCompareState({ a: compareBase, b: node.hash, aLabel: shorth(compareBase), bLabel: shorth(node.hash) })

  // ---- interactive rebase ----
  function openInteractiveRebase(node) {
    // Git refuses to rebase with tracked changes in the index or working tree
    // (untracked files are fine). Catch that up front instead of letting the
    // user configure a whole rewrite that then fails at the last step.
    const dirty = (repo.status?.staged?.length || 0) + (repo.status?.unstaged?.length || 0) > 0
    if (dirty) {
      toast('info', 'Commit or stash your current changes before rewriting history — a rebase needs a clean working tree.')
      return
    }
    const byHash = new Map(repo.commits.map((c) => [c.hash, c]))
    const baseHash = node.parents?.[0] || null
    const chain = []
    const seen = new Set()
    let cur = repo.head
    while (cur && cur !== baseHash && !seen.has(cur)) {
      seen.add(cur)
      const c = byHash.get(cur)
      if (!c) break
      chain.push(c) // newest → oldest
      cur = c.parents?.[0] || null
    }
    if (!chain.some((c) => c.hash === node.hash)) {
      toast('error', 'You can only rewrite a run of commits on your current branch, ending at the latest commit.')
      return
    }
    setIrebaseState({
      base: baseHash,
      baseLabel: baseHash ? baseHash.slice(0, 7) : '(root)',
      commits: chain.slice().reverse(), // oldest → newest, matching git's todo order
    })
  }
  async function runInteractiveRebase(todo) {
    if (busyRef.current) return
    const st = irebaseState
    setBusy(true)
    let ok = false
    let err = null
    try {
      await call(window.api.interactiveRebase(repoPath, st.base || '--root', todo))
      ok = true
    } catch (e) {
      err = e.message
    }
    const data = await refreshAfterOperation()
    setBusy(false)
    setIrebaseState(null)
    if (data?.conflict?.inProgress) {
      toast('info', 'That interactive rebase hit conflicts. Resolve the highlighted files on the right, then finish the rebase.')
    } else if (ok) {
      toast('success', 'History rewritten.')
      const h = headHash(data)
      if (h) {
        setSelectedHash(h)
        setRightTab('details')
      }
    } else {
      toast('error', err || 'Could not rewrite history.')
    }
  }

  function openCommitMenu(node, x, y) {
    const cur = repo?.currentBranch || 'current branch'
    const isHead = (node.refs || []).some((r) => r.type === 'head')
    const items = [
      { label: 'Switch here (look around)', icon: 'switch', onClick: () => commitAction('switch', node) },
      { label: 'Create branch here…', icon: 'branch', onClick: () => commitAction('branchAt', node) },
      { label: 'Create tag here…', icon: 'tag', onClick: () => commitAction('tag', node) },
      { divider: true },
      { label: `Cherry-pick onto ${cur}`, icon: 'copy', onClick: () => commitAction('cherryPick', node) },
      { label: 'Revert this commit', icon: 'undo', onClick: () => commitAction('revert', node) },
      ...(isHead
        ? [
            { label: 'Amend last commit…', icon: 'commit', onClick: () => commitAction('amend', node) },
            { label: 'Undo this commit (keep changes)', icon: 'undo', onClick: () => commitAction('uncommit', node) },
          ]
        : []),
      { divider: true },
      { label: 'Rewrite history from here…', icon: 'rebase', onClick: () => openInteractiveRebase(node) },
      { divider: true },
      { label: `Reset ${cur} here — keep changes staged`, icon: 'reset', onClick: () => commitAction('reset-soft', node) },
      { label: `Reset ${cur} here — keep changes in files`, icon: 'reset', onClick: () => commitAction('reset-mixed', node) },
      { label: `Reset ${cur} here — discard changes`, icon: 'reset', danger: true, onClick: () => commitAction('reset-hard', node) },
      { divider: true },
      { label: 'Compare with current branch', icon: 'eye', onClick: () => onCompareWithHead(node) },
      { label: 'Set as compare base', icon: 'copy', onClick: () => onSetCompareBase(node) },
      ...(compareBase && compareBase !== node.hash
        ? [{ label: `Compare with base (${compareBase.slice(0, 7)})`, icon: 'eye', onClick: () => onCompareWithBase(node) }]
        : []),
      { divider: true },
      { label: 'Copy commit ID', icon: 'copy', onClick: () => commitAction('copy', node) },
    ]
    setMenu({ x, y, items })
  }

  // ---- drag-and-drop on the graph ----
  // source/target are { kind: 'commit'|'branch', hash?|name?, isCurrent? }. Each
  // drop maps to an existing, previewed action (opened via ActionModal) or a
  // compare. Multiple options surface as a small drop menu.
  function onDropGesture(source, target, x, y) {
    if (!source || !source.kind || !target || !target.kind) return
    if (source.kind === 'commit' && target.kind === 'commit' && source.hash === target.hash) return
    if (source.kind === 'branch' && target.kind === 'branch' && source.name === target.name) return

    const items = []
    if (target.kind === 'commit') {
      const C = target.hash
      if (source.kind === 'commit') {
        items.push({
          label: 'Compare these two commits',
          icon: 'eye',
          onClick: () => setCompareState({ a: source.hash, b: C, aLabel: shorth(source.hash), bLabel: shorth(C) }),
        })
      } else if (source.isCurrent) {
        items.push({ label: `Move “${source.name}” here — keep changes`, icon: 'reset', onClick: () => setAction({ type: 'reset', mode: 'mixed', hash: C }) })
        items.push({ label: `Move “${source.name}” here — discard changes`, icon: 'reset', danger: true, onClick: () => setAction({ type: 'reset', mode: 'hard', hash: C }) })
        items.push({ divider: true })
        items.push({ label: 'Create a branch here…', icon: 'branch', onClick: () => setAction({ type: 'branchAt', hash: C }) })
        items.push({ label: 'Tag this commit…', icon: 'tag', onClick: () => setAction({ type: 'tag', hash: C }) })
      } else {
        items.push({ label: `Move “${source.name}” here`, icon: 'reset', onClick: () => setAction({ type: 'moveBranch', name: source.name, hash: C }) })
      }
    } else if (target.kind === 'branch') {
      const T = target.name
      if (source.kind === 'commit') {
        if (!target.isCurrent) {
          toast('info', `Switch to “${T}” first to cherry-pick onto it.`)
          return
        }
        items.push({ label: `Cherry-pick this commit onto “${T}”`, icon: 'copy', onClick: () => setAction({ type: 'cherryPick', hash: source.hash }) })
      } else {
        if (!target.isCurrent) {
          toast('info', `Switch to “${T}” first to merge or rebase into it.`)
          return
        }
        items.push({ label: `Merge “${source.name}” into “${T}”`, icon: 'merge', onClick: () => setAction({ type: 'merge', branch: source.name }) })
        items.push({ label: `Rebase “${T}” onto “${source.name}”`, icon: 'rebase', onClick: () => setAction({ type: 'rebase', onto: source.name }) })
      }
    }

    const real = items.filter((i) => !i.divider)
    if (real.length === 0) return
    if (real.length === 1) {
      real[0].onClick()
      return
    }
    setMenu({ x, y, items })
  }

  // ---- sidebar / toolbar entrypoints ----
  const onCheckout = (name) => setAction({ type: 'checkout', ref: name })
  const onMerge = (name) => setAction({ type: 'merge', branch: name })
  const onRebase = (name) => setAction({ type: 'rebase', onto: name })
  const onDeleteBranch = (name) => setAction({ type: 'deleteBranch', name })
  const onRenameBranch = (name) => setAction({ type: 'renameBranch', oldName: name })
  const onRenameRemote = (name) => setAction({ type: 'renameRemote', oldName: name })
  const onCheckoutRemote = (name) => setAction({ type: 'checkoutRemote', ref: name })
  const onDeleteTag = (name) => setAction({ type: 'deleteTag', name })
  const onPushTag = (name) => setAction({ type: 'pushTag', name })
  const onDeleteRemoteTag = (name) => setAction({ type: 'deleteRemoteTag', name })
  const onDeleteRemoteBranch = (name) => setAction({ type: 'deleteRemoteBranch', name })
  const onStashPop = (index) => setAction({ type: 'stashPop', index })
  const onStashApply = (index) => setAction({ type: 'stashApply', index })
  const onStashDrop = (index) => setAction({ type: 'stashDrop', index })

  // ---- remotes ----
  const onAddRemote = () => setRemoteModalOpen(true)
  async function doAddRemote({ name, url }) {
    if (busyRef.current) return
    setBusy(true)
    try {
      await call(window.api.addRemote(repoPath, name, url))
      toast('success', `Added remote “${name}”.`)
      setRemoteModalOpen(false)
    } catch (e) {
      toast('error', e.message)
    } finally {
      await refreshAfterOperation()
      setBusy(false)
    }
  }
  const onRemoveRemote = (name) =>
    setConfirm({
      title: `Remove remote “${name}”?`,
      body: 'This only removes the link from this repository — the remote server and its data are untouched.',
      confirmLabel: 'Remove remote',
      onYes: () => {
        setConfirm(null)
        fileOp(() => window.api.removeRemote(repoPath, name))
      },
    })

  async function updateUpstream(branch, upstream) {
    if (busyRef.current) return
    setBusy(true)
    try {
      await call(window.api.setUpstream(repoPath, branch, upstream))
      await refresh()
      setTrackingBranch(null)
      toast('success', `“${branch}” now tracks “${upstream}”.`)
    } catch (error) {
      toast('error', error?.message || 'The upstream branch could not be set.')
    } finally {
      setBusy(false)
    }
  }

  async function unsetUpstream(branch) {
    if (busyRef.current) return
    setBusy(true)
    try {
      await call(window.api.unsetUpstream(repoPath, branch))
      await refresh()
      setTrackingBranch(null)
      toast('success', `“${branch}” no longer tracks a remote branch.`)
    } catch (error) {
      toast('error', error?.message || 'The upstream branch could not be removed.')
    } finally {
      setBusy(false)
    }
  }

  async function chooseWorktreeParent() {
    try {
      return await call(window.api.chooseDirectory('Choose where to create the worktree'))
    } catch (error) {
      toast('error', error?.message || 'The worktree folder could not be chosen.')
      return null
    }
  }

  async function createWorktree({ parentDir, folderName, ref, newBranch, openAfter }) {
    if (busyRef.current) return
    setBusy(true)
    let target = null
    try {
      target = await call(window.api.addWorktree(repoPath, parentDir, folderName, ref, newBranch))
      await refresh()
      setWorktreeOpen(false)
      toast('success', `Created worktree “${folderName}”.`)
    } catch (error) {
      toast('error', error?.message || 'The worktree could not be created.')
    } finally {
      setBusy(false)
    }
    if (target && openAfter) await openTab(target)
  }

  const status = repo?.status || {}
  const dirtyCount = changedFileCount(status)
  const originUrl = repo?.remotes?.find((r) => r.name === 'origin')?.url || repo?.remotes?.[0]?.url
  const ghInfo = originUrl ? parseGitHubRemote(originUrl) : null
  const githubAvailable = !!(repo && ghInfo && ghInfo.isGitHub)
  const prAvailable = !!(repo && repo.currentBranch && ghInfo && ghInfo.isGitHub)
  const selectedCommit = repo?.commits?.find((commit) => commit.hash === selectedHash)
  const commandDisabled = busy || loading
  const commands = [
    {
      id: 'open-repository',
      label: 'Open repository',
      category: 'Repository',
      keywords: 'folder local',
      icon: 'folder',
      shortcut: `${modKey}O`,
      disabled: commandDisabled,
      run: openRepo,
    },
    {
      id: 'clone-repository',
      label: 'Clone repository',
      category: 'Repository',
      keywords: 'remote url download',
      icon: 'clone',
      shortcut: `${modKey}Shift+O`,
      disabled: commandDisabled,
      run: () => setCloneOpen(true),
    },
    {
      id: 'refresh-repository',
      label: 'Refresh repository',
      category: 'Repository',
      keywords: 'reload rescan status',
      icon: 'refresh',
      shortcut: `${modKey}R`,
      disabled: !repo || commandDisabled,
      run: manualRefresh,
    },
    {
      id: 'working-changes',
      label: 'Show working changes',
      category: 'View',
      keywords: 'stage commit files',
      icon: 'commit',
      disabled: !repo,
      run: () => setRightTab('changes'),
    },
    {
      id: 'commit',
      label: 'Commit staged changes',
      category: 'Working copy',
      keywords: 'save snapshot',
      icon: 'commit',
      shortcut: `${modKey}Enter`,
      disabled: !repo || commandDisabled || !(status.staged?.length > 0 && commitMessage.trim()),
      run: doCommit,
    },
    {
      id: 'create-branch',
      label: 'Create branch',
      category: 'Branch',
      keywords: 'new checkout',
      icon: 'branch',
      disabled: !repo || commandDisabled,
      run: () => setAction({ type: 'branch' }),
    },
    {
      id: 'fetch',
      label: 'Fetch all remotes',
      category: 'Remote',
      keywords: 'prune sync download',
      icon: 'fetch',
      disabled: !repo || commandDisabled,
      run: () => setAction({ type: 'fetch' }),
    },
    {
      id: 'pull',
      label: 'Pull current branch',
      category: 'Remote',
      keywords: 'download merge rebase sync',
      icon: 'pull',
      disabled: !repo || commandDisabled,
      run: () => setAction({ type: 'pull' }),
    },
    {
      id: 'push',
      label: 'Push current branch',
      category: 'Remote',
      keywords: 'upload publish',
      icon: 'push',
      disabled: !repo || commandDisabled,
      run: () => setAction({ type: 'push' }),
    },
    {
      id: 'force-push',
      label: 'Force-push with lease',
      category: 'Remote · destructive',
      keywords: 'overwrite safe lease',
      icon: 'alert',
      disabled: !repo || commandDisabled,
      run: () => setAction({ type: 'forcePush' }),
    },
    {
      id: 'stash',
      label: 'Stash working changes',
      category: 'Working copy',
      keywords: 'shelve save later',
      icon: 'stash',
      disabled: !repo || commandDisabled || dirtyCount === 0,
      run: () => setAction({ type: 'stash' }),
    },
    {
      id: 'amend',
      label: 'Amend latest commit',
      category: 'History',
      keywords: 'edit last message',
      icon: 'commit',
      disabled: !selectedCommit || selectedCommit.hash !== repo?.head || commandDisabled,
      run: () => commitAction('amend', selectedCommit),
    },
    {
      id: 'interactive-rebase',
      label: 'Interactively rebase from selected commit',
      category: 'History',
      keywords: 'rewrite squash fixup reorder drop',
      icon: 'rebase',
      disabled: !selectedCommit || commandDisabled,
      run: () => openInteractiveRebase(selectedCommit),
    },
    {
      id: 'compare-head',
      label: 'Compare selected commit with HEAD',
      category: 'History',
      keywords: 'diff revisions branches',
      icon: 'eye',
      disabled: !selectedCommit || commandDisabled,
      run: () => onCompareWithHead(selectedCommit),
    },
    {
      id: 'undo',
      label: 'Undo last Git action',
      category: 'History',
      keywords: 'restore reflog safety',
      icon: 'undo',
      disabled: !repo || commandDisabled,
      run: undoLast,
    },
    {
      id: 'history',
      label: 'Open reflog and undo history',
      category: 'History',
      keywords: 'restore recover reflog',
      icon: 'history',
      disabled: !repo || commandDisabled,
      run: openHistory,
    },
    {
      id: 'remotes',
      label: 'Manage remotes',
      category: 'Repository',
      keywords: 'origin add remove',
      icon: 'pr',
      disabled: !repo || commandDisabled,
      run: () => setRemoteModalOpen(true),
    },
    {
      id: 'worktree',
      label: 'Add worktree',
      category: 'Repository',
      keywords: 'multiple branches folders parallel checkout',
      icon: 'branch',
      disabled: !repo || commandDisabled,
      run: () => setWorktreeOpen(true),
    },
    {
      id: 'pull-request',
      label: 'Open GitHub pull requests and issues',
      category: 'Remote',
      keywords: 'github review merge ci issues pr',
      icon: 'pr',
      disabled: !githubAvailable || commandDisabled,
      run: () => setGitHubOpen(true),
    },
    {
      id: 'activity',
      label: 'Show Git activity',
      category: 'View',
      keywords: 'operations progress errors diagnostics',
      icon: 'history',
      run: () => setActivityOpen(true),
    },
    {
      id: 'settings',
      label: 'Open settings',
      category: 'Application',
      keywords: 'identity credentials preferences',
      icon: 'gear',
      shortcut: `${modKey},`,
      disabled: commandDisabled,
      run: () => setSettingsOpen(true),
    },
    {
      id: 'help',
      label: 'Open Git help',
      category: 'Application',
      keywords: 'glossary learn documentation',
      icon: 'help',
      shortcut: '?',
      run: () => openHelp(null),
    },
    ...tabs.map((tab) => ({
      id: `repository-${tab.path}`,
      label: `Switch repository: ${tab.name}`,
      category: 'Repository switcher',
      keywords: tab.path,
      icon: 'folder',
      disabled: commandDisabled || tab.path === repoPath,
      run: () => switchTab(tab.path),
    })),
    ...(repo?.localBranches || []).map((branch) => ({
      id: `branch-${branch.name}`,
      label: `Switch branch: ${branch.name}`,
      category: branch.current ? 'Current branch' : 'Branch switcher',
      keywords: `checkout ${branch.upstream || ''}`,
      icon: 'branch',
      disabled: commandDisabled || branch.current,
      run: () => setAction({ type: 'checkout', ref: branch.name }),
    })),
    ...(repo?.remoteBranches || []).map((branch) => ({
      id: `remote-branch-${branch.name}`,
      label: `Track remote branch: ${branch.name}`,
      category: 'Branch switcher',
      keywords: 'checkout remote tracking',
      icon: 'pr',
      disabled: commandDisabled,
      run: () => setAction({ type: 'checkoutRemote', ref: branch.name }),
    })),
  ]

  // Rebuilt every render so it reads current state, but registered only once.
  shortcutHandler.current = (event) => {
    const key = event.key.toLowerCase()
    const modifier = isMac ? event.metaKey : event.ctrlKey
    const blockingSurface =
      action || confirm || initPrompt || helpOpen || historyOpen || activityOpen || prOpen || githubOpen || cloneOpen ||
      settingsOpen || remoteModalOpen || trackingBranch || worktreeOpen || diffState || fileInspector || compareState || irebaseState
    if (modifier && key === 'k') {
      event.preventDefault()
      if (!commandDisabled && (commandOpen || !blockingSurface)) setCommandOpen((open) => !open)
      return
    }
    if (commandOpen) return
    if (blockingSurface || commandDisabled) return
    const editing = event.target instanceof HTMLElement &&
      (event.target.matches('input, textarea, select') || event.target.isContentEditable)
    if (modifier && event.shiftKey && key === 'o') {
      event.preventDefault()
      setCloneOpen(true)
    } else if (modifier && key === 'o') {
      event.preventDefault()
      openRepo()
    } else if (modifier && key === 'r' && repo) {
      event.preventDefault()
      manualRefresh()
    } else if (modifier && key === ',' ) {
      event.preventDefault()
      setSettingsOpen(true)
    } else if (modifier && event.key === 'Enter' && repo && status.staged?.length > 0 && commitMessage.trim()) {
      event.preventDefault()
      doCommit()
    } else if (!editing && event.key === '?') {
      event.preventDefault()
      openHelp(null)
    }
  }
  useEffect(() => {
    const onShortcut = (event) => shortcutHandler.current?.(event)
    window.addEventListener('keydown', onShortcut)
    return () => window.removeEventListener('keydown', onShortcut)
  }, [])

  return (
    <HelpContext.Provider value={openHelp}>
      <div className="app" style={{ '--sidebar-width': `${sidebarWidth}px`, '--rightpanel-width': `${rightPanelWidth}px` }}>
        {(loading || busy) && <div className="loading-bar" role="progressbar" aria-label="GitVista is working" />}
        <Toolbar
          repo={repo}
          busy={commandDisabled}
          updateStatus={updateStatus}
          activities={activities}
          prAvailable={githubAvailable}
          onOpen={openRepo}
          onClone={() => setCloneOpen(true)}
          onSandbox={openSandbox}
          onRefresh={manualRefresh}
          onFetch={() => setAction({ type: 'fetch' })}
          onPull={() => setAction({ type: 'pull' })}
          onPush={() => setAction({ type: 'push' })}
          onBranch={() => setAction({ type: 'branch' })}
          onStash={() => (dirtyCount > 0 ? setAction({ type: 'stash' }) : toast('info', 'Nothing to stash — your changes are all committed.'))}
          onUndo={undoLast}
          onHistory={openHistory}
          onCreatePR={() => setGitHubOpen(true)}
          onSettings={() => setSettingsOpen(true)}
          onHelp={() => openHelp(null)}
          onCommands={() => setCommandOpen(true)}
          onActivity={() => setActivityOpen(true)}
          onInstallUpdate={confirmInstallUpdate}
        />

        {tabs.length > 0 && (
          <TabBar tabs={tabs} activePath={repoPath} onSwitch={switchTab} onClose={closeTab} onNew={openRepo} busy={commandDisabled} />
        )}

        {!repo ? (
          <WelcomeScreen
            onOpen={openRepo}
            onClone={() => setCloneOpen(true)}
            onSandbox={openSandbox}
            hasApi={hasApi}
            recentRepos={recentRepos}
            openingRecent={openingRecent}
            busy={commandDisabled}
            onOpenRecent={openRecentRepository}
            onForgetRecent={(path) => setRecentRepos((current) => current.filter((candidate) => candidate !== path))}
          />
        ) : (
          <div className="workspace">
            <Sidebar
              repo={repo}
              busy={commandDisabled}
              onCheckout={onCheckout}
              onMerge={onMerge}
              onRebase={onRebase}
              onDeleteBranch={onDeleteBranch}
              onRenameBranch={onRenameBranch}
              onSetUpstream={setTrackingBranch}
              onCheckoutRemote={onCheckoutRemote}
              onDeleteTag={onDeleteTag}
              onPushTag={onPushTag}
              onDeleteRemoteTag={onDeleteRemoteTag}
              onDeleteRemoteBranch={onDeleteRemoteBranch}
              onStashPop={onStashPop}
              onStashApply={onStashApply}
              onStashDrop={onStashDrop}
              onAddRemote={onAddRemote}
              onRemoveRemote={onRemoveRemote}
              onRenameRemote={onRenameRemote}
              onAddWorktree={() => setWorktreeOpen(true)}
              onOpenWorktree={openTab}
            />
            <div
              className="panel-resizer"
              role="separator"
              aria-label="Resize repository sidebar"
              aria-orientation="vertical"
              aria-valuemin="190"
              aria-valuemax="420"
              aria-valuenow={sidebarWidth}
              tabIndex="0"
              onPointerDown={(event) => beginPanelResize('sidebar', event)}
              onKeyDown={(event) => resizePanelWithKeyboard('sidebar', event)}
              onDoubleClick={() => setSidebarWidth(246)}
            />
            <main className="center">
              {(repo.conflict?.inProgress || repo.conflict?.conflictedFiles?.length > 0) && <ConflictBanner repo={repo} busy={commandDisabled} onAbort={() => runConflict('abort')} />}
              <GraphView
                key={repoPath}
                repo={repo}
                selected={rightTab === 'changes' ? { kind: 'wip' } : { kind: 'commit', hash: selectedHash }}
                onSelectCommit={onSelectCommit}
                onSelectWip={onSelectWip}
                onContextCommit={openCommitMenu}
                onDropGesture={onDropGesture}
              />
            </main>
            <div
              className="panel-resizer"
              role="separator"
              aria-label="Resize details panel"
              aria-orientation="vertical"
              aria-valuemin="290"
              aria-valuemax="620"
              aria-valuenow={rightPanelWidth}
              tabIndex="0"
              onPointerDown={(event) => beginPanelResize('right', event)}
              onKeyDown={(event) => resizePanelWithKeyboard('right', event)}
              onDoubleClick={() => setRightPanelWidth(358)}
            />
            <section className="rightpanel">
              {repo.conflict?.inProgress || repo.conflict?.conflictedFiles?.length > 0 ? (
                <ConflictPanel
                  repo={repo}
                  busy={commandDisabled}
                  onResolve={onResolve}
                  onMarkResolved={onMarkResolved}
                  onView={openConflictView}
                  onOpenFile={onOpenFile}
                  onAbort={() => runConflict('abort')}
                  onContinue={() => runConflict('continue')}
                />
              ) : (
                <>
                  <div className="rp-tabs">
                    <button
                      className={'rp-tab' + (rightTab === 'changes' ? ' active' : '')}
                      onClick={() => setRightTab('changes')}
                    >
                      Working changes
                      {dirtyCount > 0 && <span className="rp-badge">{dirtyCount}</span>}
                    </button>
                    <button
                      className={'rp-tab' + (rightTab === 'details' ? ' active' : '')}
                      onClick={() => setRightTab('details')}
                    >
                      Commit details
                    </button>
                  </div>
                  <div className="rp-body">
                    {rightTab === 'changes' ? (
                      <StagingPanel
                        repo={repo}
                        message={commitMessage}
                        onMessage={setCommitMessage}
                        coAuthors={coAuthors}
                        onAddCoAuthor={(author) => setCoAuthors((current) => [...current, author])}
                        onRemoveCoAuthor={(email) => setCoAuthors((current) => current.filter((author) => author.email !== email))}
                        onStage={onStage}
                        onUnstage={onUnstage}
                        onStageAll={onStageAll}
                        onUnstageAll={onUnstageAll}
                        onDiscard={onDiscard}
                        onCommit={doCommit}
                        onOpenDiff={openDiff}
                        onFileHistory={(file) => setFileInspector({ file: file.path, refName: null })}
                        busy={commandDisabled}
                        commitBusy={commitBusy}
                      />
                    ) : (
                      <CommitDetails
                        repo={repo}
                        hash={selectedHash}
                        commitOverride={selectedCommitOverride}
                        onOpenDiff={(file, previousPath) => openCommitDiff(file, selectedHash, previousPath)}
                        onFileHistory={(file) => setFileInspector({ file, refName: selectedHash })}
                        onCommitAction={commitAction}
                      />
                    )}
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {repo && <StatusBar repo={repo} busy={commandDisabled} activities={activities} onActivity={() => setActivityOpen(true)} />}

        {action && (
          <ActionModal
            action={action}
            repo={repo}
            busy={busy}
            onConfirm={runAction}
            onCancel={() => setAction(null)}
          />
        )}

        {confirm && (
          <ModalOverlay className="modal-overlay" onClick={() => setConfirm(null)}>
            <div className={'modal' + (confirm.danger ? ' modal-danger' : '')} onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">{confirm.title}</div>
              <p className="modal-explain">{confirm.body}</p>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={() => setConfirm(null)}>
                  Cancel
                </button>
                <button className={confirm.danger ? 'danger-btn' : 'primary-btn'} onClick={confirm.onYes} disabled={busy}>
                  {confirm.confirmLabel || 'Confirm'}
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {initPrompt && (
          <ModalOverlay className="modal-overlay" onClick={() => setInitPrompt(null)}>
            <div className="modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-title">Start tracking this folder with Git?</div>
              <p className="modal-explain">
                “{initPrompt}” isn't a Git repository yet. GitVista can set one up here so you can start saving
                snapshots of your work.
              </p>
              <div className="modal-command">
                <span className="modal-command-label">Behind the scenes:</span>
                <code>git init</code>
              </div>
              <div className="modal-actions">
                <button className="ghost-btn" onClick={() => setInitPrompt(null)}>
                  Cancel
                </button>
                <button className="primary-btn" onClick={() => doInit(initPrompt)}>
                  Initialise Git here
                </button>
              </div>
            </div>
          </ModalOverlay>
        )}

        {helpOpen && <HelpPanel openTerm={helpTerm} onClose={() => setHelpOpen(false)} />}

        {historyOpen && <HistoryPanel entries={reflog} onRestore={onRestore} onClose={() => setHistoryOpen(false)} />}

        {activityOpen && (
          <ActivityPanel
            activities={activities}
            onClose={() => setActivityOpen(false)}
            onClear={() => setActivities((current) => current.filter((item) => item.state === 'running'))}
          />
        )}

        {commandOpen && <CommandPalette commands={commands} onClose={() => setCommandOpen(false)} />}

        {prOpen && repo && <PRModal repo={repo} busy={busy} onConfirm={createPR} onCancel={() => setPrOpen(false)} />}

        {githubOpen && repo && (
          <GitHubPanel
            repoPath={repoPath}
            onClose={() => setGitHubOpen(false)}
            onCreate={() => {
              setGitHubOpen(false)
              if (prAvailable) setPrOpen(true)
              else toast('info', 'Switch to a local branch before creating a pull request.')
            }}
            onSettings={() => {
              setGitHubOpen(false)
              setSettingsOpen(true)
            }}
            toast={toast}
          />
        )}

        {cloneOpen && (
          <CloneModal busy={busy} onClone={doClone} onCancel={() => setCloneOpen(false)} onChooseDir={chooseCloneDir} />
        )}

        {settingsOpen && (
          <SettingsModal
            theme={theme}
            onTheme={setTheme}
            repoPath={repoPath}
            onClose={() => setSettingsOpen(false)}
            onSaved={() => repoPath && refresh()}
            toast={toast}
          />
        )}

        {remoteModalOpen && (
          <RemoteModal busy={busy} existing={repo?.remotes || []} onAdd={doAddRemote} onCancel={() => setRemoteModalOpen(false)} />
        )}

        {trackingBranch && (
          <BranchTrackingModal
            branch={trackingBranch}
            remoteBranches={(repo?.remoteBranches || []).map((branch) => branch.name)}
            busy={busy}
            onSet={updateUpstream}
            onUnset={unsetUpstream}
            onClose={() => setTrackingBranch(null)}
          />
        )}

        {worktreeOpen && repo && (
          <WorktreeModal
            repo={repo}
            busy={busy}
            onChooseParent={chooseWorktreeParent}
            onCreate={createWorktree}
            onClose={() => setWorktreeOpen(false)}
          />
        )}

        {diffState && (
          <DiffModal
            state={diffState}
            busy={busy}
            onClose={closeDiff}
            onRetry={retryDiff}
            onStageHunk={onStageHunkOp}
            onUnstageHunk={onUnstageHunkOp}
          />
        )}

        {fileInspector && (
          <FileInspectorPanel
            repoPath={repoPath}
            file={fileInspector.file}
            refName={fileInspector.refName}
            onClose={() => setFileInspector(null)}
            onOpenDiff={(file, hash, previousPath) => {
              setFileInspector(null)
              openCommitDiff(file, hash, previousPath)
            }}
            onSelectCommit={(hash) => {
              setSelectedHash(hash)
              setRightTab('details')
            }}
          />
        )}

        {menu && <ContextMenu x={menu.x} y={menu.y} items={menu.items} onClose={() => setMenu(null)} />}

        {compareState && (
          <CompareModal
            repoPath={repoPath}
            a={compareState.a}
            b={compareState.b}
            aLabel={compareState.aLabel}
            bLabel={compareState.bLabel}
            onClose={() => setCompareState(null)}
          />
        )}

        {irebaseState && (
          <InteractiveRebaseModal
            base={irebaseState.base}
            baseLabel={irebaseState.baseLabel}
            repo={repo}
            commits={irebaseState.commits}
            busy={busy}
            onConfirm={runInteractiveRebase}
            onCancel={() => setIrebaseState(null)}
          />
        )}

        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </div>
    </HelpContext.Provider>
  )
}
