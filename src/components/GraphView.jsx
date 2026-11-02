import { useEffect, useMemo, useRef, useState } from 'react'
import { computeGraph, graphWidth } from '../lib/graphLayout'
import GraphSvg from './GraphSvg'
import Avatar from './Avatar'
import Icon from './Icon'
import { shortHash, relativeTime } from '../lib/format'
import { changedFileCount } from '../lib/repositorySession'
import { prepareGraphCommits, groupRefs, branchOwnCommits, WIP_HASH } from '../lib/graphCommits'

const GEOM = { rowHeight: 36, laneWidth: 16, padX: 20, nodeR: 5 }
const MAX_PILLS = 3
const PILL_ICON = { head: 'branch', branch: 'branch', remote: 'cloud', tag: 'tag', detached: 'commit' }

// The central history: an SVG graph on the left, perfectly aligned with HTML
// rows on the right that show each commit's message, author and time. Commit
// rows and local-branch badges are drag-and-drop sources/targets (see
// onDropGesture) for spatial merge / rebase / cherry-pick / move / compare.
export default function GraphView({ repo, selected, onSelectCommit, onSelectWip, onContextCommit, onDropGesture }) {
  const [query, setQuery] = useState('')
  const [searchMode, setSearchMode] = useState('visible')
  const [searchResults, setSearchResults] = useState(null)
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [dragOver, setDragOver] = useState(null) // 'commit:<hash>' | 'branch:<name>'
  const [scrollTop, setScrollTop] = useState(0)
  const [viewportHeight, setViewportHeight] = useState(600)
  const [hoverHash, setHoverHash] = useState(null)
  const [focusTip, setFocusTip] = useState(null)
  const [landed, setLanded] = useState(null)
  const [fresh, setFresh] = useState(null)
  const seen = useRef({ path: null, hashes: new Set(), wip: false })
  const scrollRef = useRef(null)
  const setPayload = (e, data) => {
    try {
      e.dataTransfer.setData('text/plain', JSON.stringify(data))
      e.dataTransfer.effectAllowed = 'move'
    } catch {
      /* ignore */
    }
  }
  const getPayload = (e) => {
    try {
      return JSON.parse(e.dataTransfer.getData('text/plain') || 'null')
    } catch {
      return null
    }
  }
  const q = query.trim().toLowerCase()
  useEffect(() => {
    let alive = true
    let timer = null
    if (!q || searchMode === 'visible') {
      setSearchResults(null)
      setSearchLoading(false)
      setSearchError(null)
      return undefined
    }
    setSearchLoading(true)
    setSearchError(null)
    setSearchResults(null)
    timer = setTimeout(() => {
      window.api.searchHistory(repo.path, query.trim(), searchMode)
        .then((result) => {
          if (!alive) return
          if (result?.ok) setSearchResults(result.data)
          else setSearchError(result?.error || 'History search failed.')
        })
        .catch((error) => {
          if (alive) setSearchError(error?.message || 'History search failed.')
        })
        .finally(() => {
          if (alive) setSearchLoading(false)
        })
    }, 280)
    return () => {
      alive = false
      if (timer) clearTimeout(timer)
    }
  }, [q, query, searchMode, repo.path])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return undefined
    const updateSize = () => setViewportHeight(element.clientHeight || 600)
    updateSize()
    const observer = new ResizeObserver(updateSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    setScrollTop(0)
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [q, searchMode])

  const status = repo.status || {}
  const dirtyCount = changedFileCount(status)
  const remoteSearch = q && searchMode !== 'visible'
  const wipCount = q ? 0 : dirtyCount
  const graphCommits = useMemo(
    () => (remoteSearch ? searchResults?.commits || [] : prepareGraphCommits(repo.commits, { stashes: repo.stashes, head: repo.head, wipCount })),
    [remoteSearch, searchResults, repo.commits, repo.stashes, repo.head, wipCount]
  )
  const { nodes, edges, laneCount } = useMemo(() => computeGraph(graphCommits), [graphCommits])
  const focusHashes = useMemo(() => (focusTip ? branchOwnCommits(nodes, focusTip, repo.head) : null), [focusTip, nodes, repo.head])

  // New commits after a refresh slide in, and the first rows of a newly opened
  // repository arrive with a short stagger. Rows that mount while scrolling do
  // not animate, because only these hashes are marked fresh.
  useEffect(() => {
    const hashes = new Set(repo.commits.map((commit) => commit.hash))
    const previous = seen.current
    const hasWip = wipCount > 0
    let marked
    if (previous.path !== repo.path) marked = { hashes: new Set(nodes.slice(0, 24).map((node) => node.hash)), intro: true }
    else {
      marked = { hashes: new Set([...hashes].filter((hash) => !previous.hashes.has(hash))), intro: false }
      if (hasWip && !previous.wip) marked.hashes.add(WIP_HASH)
    }
    seen.current = { path: repo.path, hashes, wip: hasWip }
    if (!marked.hashes.size) return undefined
    setFresh(marked)
    const timer = setTimeout(() => setFresh(null), 1400)
    return () => clearTimeout(timer)
  }, [repo.path, repo.commits, wipCount > 0])

  useEffect(() => {
    if (!landed) return undefined
    const timer = setTimeout(() => setLanded(null), 900)
    return () => clearTimeout(timer)
  }, [landed])
  const gw = graphWidth(laneCount, GEOM)
  const matches = (n) =>
    !q ||
    (n.subject || '').toLowerCase().includes(q) ||
    (n.author?.name || '').toLowerCase().includes(q) ||
    (n.author?.email || '').toLowerCase().includes(q) ||
    n.hash.toLowerCase().startsWith(q) ||
    (n.refs || []).some((ref) => ref.name.toLowerCase().includes(q))
  const matchCount = q ? (searchMode === 'visible' ? nodes.filter(matches).length : nodes.length) : 0
  const totalHeight = nodes.length * GEOM.rowHeight
  const overscan = 18
  const firstVisible = Math.max(0, Math.floor(scrollTop / GEOM.rowHeight) - overscan)
  const lastVisible = Math.min(nodes.length, Math.ceil((scrollTop + viewportHeight) / GEOM.rowHeight) + overscan)
  const visibleNodes = nodes.slice(firstVisible, lastVisible)
  const selectedHash = selected?.kind === 'commit' ? selected.hash : null

  function reveal(node, index, focus = false) {
    if (!node) return
    if (node.wip) onSelectWip()
    else onSelectCommit(node.hash, node)
    const element = scrollRef.current
    if (element) {
      const top = index * GEOM.rowHeight
      if (top < element.scrollTop) element.scrollTop = top
      else if (top + GEOM.rowHeight > element.scrollTop + element.clientHeight) element.scrollTop = top + GEOM.rowHeight - element.clientHeight
      if (focus) element.focus({ preventScroll: true })
    }
  }

  function moveMatch(direction) {
    const found = nodes.filter(matches)
    if (!found.length) return
    const current = found.findIndex((node) => node.hash === selectedHash)
    const next = found[(current + direction + found.length) % found.length]
    reveal(next, next.row, true)
    setLanded(next.hash)
  }

  function onHistoryKey(event) {
    const current = selected?.kind === 'wip' ? nodes.findIndex((node) => node.wip) : nodes.findIndex((node) => node.hash === selectedHash)
    const page = Math.max(1, Math.floor(viewportHeight / GEOM.rowHeight))
    const positions = { ArrowDown: current + 1, ArrowUp: current - 1, Home: 0, End: nodes.length - 1, PageDown: current + page, PageUp: current - page }
    if (event.key in positions) {
      event.preventDefault()
      const index = Math.max(0, Math.min(nodes.length - 1, positions[event.key]))
      reveal(nodes[index], index)
    } else if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
      event.preventDefault()
      const rect = event.currentTarget.getBoundingClientRect()
      if (nodes[current] && !nodes[current].wip) onContextCommit?.(nodes[current], rect.left + 60, rect.top + 30)
    }
  }

  function jumpToHead() {
    setQuery('')
    setSearchMode('visible')
    const index = prepareGraphCommits(repo.commits, { stashes: repo.stashes, head: repo.head, wipCount: dirtyCount }).findIndex((commit) => commit.hash === repo.head)
    if (index < 0) return
    onSelectCommit(repo.head, repo.commits.find((commit) => commit.hash === repo.head))
    setLanded(repo.head)
    requestAnimationFrame(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = Math.max(0, index * GEOM.rowHeight - 80)
        scrollRef.current.focus({ preventScroll: true })
      }
    })
  }

  if (repo.commits.length === 0) {
    return (
      <div className="graph-view">
        {dirtyCount > 0 && (
          <button className={'wip-bar' + (selected?.kind === 'wip' ? ' active' : '')} onClick={onSelectWip}>
            <span className="wip-dot" />
            <span className="wip-label">Uncommitted changes</span>
            <span className="wip-count">{dirtyCount}</span>
          </button>
        )}
        <div className="graph-empty">
          <Icon name="commit" size={32} />
          <p>No commits yet.</p>
          <p className="dim">Stage a file and make your first commit to start your project's history.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-view">
      <div className="graph-heading"><h1>Commit history <span>{repo.commits.length}{repo.commits.length >= 800 ? '+' : ''}</span></h1><button onClick={jumpToHead} disabled={!repo.commits.some((commit) => commit.hash === repo.head)} title="Select the current branch tip"><Icon name="commit" size={13} />Jump to HEAD</button></div>
      <div className="graph-search">
        <Icon name="search" size={14} />
        <input
          type="text"
          name="commit-search"
          aria-label="Search commit history"
          placeholder="Search commits, branches or authors…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); moveMatch(event.shiftKey ? -1 : 1) } }}
        />
        <select name="commit-search-scope" value={searchMode} onChange={(event) => setSearchMode(event.target.value)} aria-label="Commit search scope">
          <option value="visible">Loaded commits</option>
          <option value="history">All history</option>
          <option value="pickaxe">Code changes</option>
        </select>
        {q && searchMode === 'visible' && matchCount > 0 && <span className="graph-match-nav"><button onClick={() => moveMatch(-1)} aria-label="Previous search match">↑</button><button onClick={() => moveMatch(1)} aria-label="Next search match">↓</button></span>}
        {searchLoading && <span className="spinner graph-search-spinner" role="status" aria-label="Searching history" />}
        {q && (
          <span className="graph-search-count">
            {matchCount} match{matchCount === 1 ? '' : 'es'}
          </span>
        )}
        {q && (
          <button className="graph-search-clear" onClick={() => setQuery('')} aria-label="Clear search">
            <Icon name="x" size={13} />
          </button>
        )}
      </div>
      {searchError && <div className="graph-search-error" role="alert">{searchError}</div>}
      {q && !searchLoading && searchMode !== 'visible' && nodes.length === 0 && (
        <div className="graph-search-empty">No commits matched this search.</div>
      )}
      {q && searchResults?.truncated && <div className="graph-search-note">Showing the newest 200 matches.</div>}
      <div className="graph-header" style={{ paddingLeft: gw }}>
        <span className="gh-msg">Commit</span>
        <span className="gh-author">Author</span>
        <span className="gh-when">When</span>
      </div>
      <div className="graph-scroll" ref={scrollRef} onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)} role="listbox" aria-label="Commit history" tabIndex={0} aria-activedescendant={selected?.kind === 'wip' && nodes[0]?.wip ? `commit-${WIP_HASH}` : visibleNodes.some((node) => node.hash === selectedHash) ? `commit-${selectedHash}` : undefined} onKeyDown={onHistoryKey}>
        <div className="graph-inner" style={{ height: totalHeight }}>
          <div className="graph-svg-wrap" style={{ width: gw }}>
            <GraphSvg
              nodes={nodes}
              edges={edges}
              laneCount={laneCount}
              geom={GEOM}
              selectedHash={selected?.kind === 'wip' ? WIP_HASH : selectedHash}
              onSelectNode={(hash, node) => (node.wip ? onSelectWip() : onSelectCommit(hash, node))}
              hoverHash={hoverHash}
              focusHashes={focusHashes}
              freshHashes={fresh?.hashes}
            />
          </div>
          <div
            className="graph-rows"
            style={{ marginLeft: gw, position: 'absolute', top: firstVisible * GEOM.rowHeight, left: 0, right: 0 }}
          >
            {visibleNodes.map((n, index) => {
              const freshStyle = fresh?.hashes.has(n.hash) ? { animationDelay: fresh.intro ? `${Math.min(firstVisible + index, 24) * 14}ms` : '0ms' } : null
              const rowState =
                (hoverHash === n.hash ? ' hovered' : '') +
                (focusHashes && !focusHashes.has(n.hash) ? ' faded' : '') +
                (freshStyle ? ' fresh' : '') +
                (landed === n.hash ? ' landed' : '')
              if (n.wip) {
                const isSel = selected?.kind === 'wip'
                return (
                  <div
                    key={n.hash}
                    className={'commit-row wip-row' + (isSel ? ' selected' : '') + rowState}
                    style={{ height: GEOM.rowHeight, ...freshStyle }}
                    id={`commit-${n.hash}`}
                    role="option"
                    aria-selected={isSel}
                    onClick={() => reveal(n, n.row, true)}
                    onMouseEnter={() => setHoverHash(n.hash)}
                    onMouseLeave={() => setHoverHash(null)}
                  >
                    <span className="cr-msg">Uncommitted changes</span>
                    <span className="wip-count">{n.wip.count} file{n.wip.count === 1 ? '' : 's'}</span>
                    <span className="wip-hint">Review and commit</span>
                  </div>
                )
              }
              const isSel = selectedHash === n.hash
              const head = (n.refs || []).some((r) => r.type === 'head' || r.type === 'detached')
              const pills = groupRefs(n.refs)
              const shown = pills.slice(0, MAX_PILLS)
              const hidden = pills.slice(MAX_PILLS)
              return (
                <div
                  key={n.hash}
                  className={
                    'commit-row' +
                    (isSel ? ' selected' : '') +
                    (head ? ' is-head' : '') +
                    (n.stash ? ' stash-row' : '') +
                    (q && searchMode === 'visible' && !matches(n) ? ' dim' : '') +
                    (dragOver === 'commit:' + n.hash ? ' drop-hover' : '') +
                    rowState
                  }
                  style={{ height: GEOM.rowHeight, '--lane-color': n.color, ...freshStyle }}
                  id={`commit-${n.hash}`}
                  role="option"
                  aria-selected={isSel}
                  draggable
                  onDragStart={(e) => setPayload(e, { kind: 'commit', hash: n.hash })}
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragOver('commit:' + n.hash)
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault()
                    const src = getPayload(e)
                    setDragOver(null)
                    onDropGesture?.(src, { kind: 'commit', hash: n.hash }, e.clientX, e.clientY)
                  }}
                  onDragEnd={() => setDragOver(null)}
                  onClick={() => reveal(n, n.row, true)}
                  onMouseEnter={() => setHoverHash(n.hash)}
                  onMouseLeave={() => setHoverHash(null)}
                  onContextMenu={(e) => {
                    e.preventDefault()
                    onContextCommit?.(n, e.clientX, e.clientY)
                  }}
                >
                  <span className="cr-refs">
                    {n.stash && (
                      <span className="ref-badge ref-stash" title="A stash: changes set aside to bring back later">
                        <Icon name="stash" size={11} />stash
                      </span>
                    )}
                    {shown.map((r) => {
                      const isBranchRef = r.type === 'branch' || r.type === 'head'
                      const target = { kind: 'branch', name: r.name, isCurrent: r.type === 'head' }
                      const title = r.synced.length ? `${r.name} is in sync with ${r.synced.join(', ')}` : r.name
                      return (
                        <span
                          key={r.type + r.name}
                          title={title}
                          className={
                            `ref-badge ref-${r.type}` +
                            (isBranchRef ? ' ref-draggable' : '') +
                            (dragOver === 'branch:' + r.name ? ' drop-hover' : '')
                          }
                          onMouseEnter={isBranchRef || r.type === 'remote' ? () => setFocusTip(n.hash) : undefined}
                          onMouseLeave={isBranchRef || r.type === 'remote' ? () => setFocusTip(null) : undefined}
                          draggable={isBranchRef || undefined}
                          onDragStart={
                            isBranchRef
                              ? (e) => {
                                  e.stopPropagation()
                                  setPayload(e, target)
                                }
                              : undefined
                          }
                          onDragOver={
                            isBranchRef
                              ? (e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  setDragOver('branch:' + r.name)
                                }
                              : undefined
                          }
                          onDragLeave={isBranchRef ? () => setDragOver(null) : undefined}
                          onDrop={
                            isBranchRef
                              ? (e) => {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  const src = getPayload(e)
                                  setDragOver(null)
                                  onDropGesture?.(src, target, e.clientX, e.clientY)
                                }
                              : undefined
                          }
                        >
                          <Icon name={PILL_ICON[r.type] || 'branch'} size={11} />
                          <span className="ref-name">{r.name}</span>
                          {r.synced.length > 0 && <span className="ref-synced"><Icon name="cloud" size={11} /></span>}
                        </span>
                      )
                    })}
                    {hidden.length > 0 && (
                      <span className="ref-badge ref-more" title={hidden.map((r) => r.name).join(', ')}>
                        +{hidden.length}
                      </span>
                    )}
                  </span>
                  <span className="cr-msg" title={n.subject}>{n.subject}</span>
                  <span className="cr-author">
                    <Avatar name={n.author?.name} email={n.author?.email} size={20} />
                    <span className="cr-author-name">{n.author?.name}</span>
                  </span>
                  <span className="cr-when" title={shortHash(n.hash)}>
                    {relativeTime(n.timestamp)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
      <div className="graph-footer"><span>{q ? `${matchCount} matching commits` : `${repo.commits.length >= 800 ? 'Newest ' : ''}${repo.commits.length} commits loaded`}</span><span>↑ ↓ Navigate · Right-click for actions</span></div>
    </div>
  )
}
