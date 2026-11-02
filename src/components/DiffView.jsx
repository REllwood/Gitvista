import { useMemo } from 'react'
import { splitHunks, buildHunkPatch, isPatchable, wordDiff } from '../lib/diff'

// Parses unified-diff text into renderable rows with old/new line numbers.
function parseDiff(text) {
  const lines = text.split('\n')
  const rows = []
  let oldNo = 0
  let newNo = 0
  for (const line of lines) {
    if (line === '') continue
    if (line.startsWith('@@')) {
      const m = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/)
      if (m) {
        oldNo = parseInt(m[1], 10)
        newNo = parseInt(m[2], 10)
      }
      rows.push({ type: 'hunk', text: line })
      continue
    }
    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('--- ') ||
      line.startsWith('+++ ') ||
      line.startsWith('new file') ||
      line.startsWith('deleted file') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity') ||
      line.startsWith('rename ') ||
      line.startsWith('\\')
    ) {
      continue
    }
    if (line.startsWith('+')) {
      rows.push({ type: 'add', text: line.slice(1), oldNo: null, newNo })
      newNo++
    } else if (line.startsWith('-')) {
      rows.push({ type: 'del', text: line.slice(1), oldNo, newNo: null })
      oldNo++
    } else {
      rows.push({ type: 'ctx', text: line.slice(1), oldNo, newNo })
      oldNo++
      newNo++
    }
  }
  return rows
}

// Parses a file that still contains Git conflict markers into colored regions.
function parseConflict(text) {
  const rows = []
  let mode = 'ctx'
  text.split('\n').forEach((line, i) => {
    if (line.startsWith('<<<<<<<')) {
      mode = 'del'
      rows.push({ type: 'marker', text: line, no: i + 1 })
    } else if (line.startsWith('|||||||')) {
      mode = 'ctx'
      rows.push({ type: 'marker', text: line + '  (original / common ancestor)', no: i + 1 })
    } else if (line.startsWith('=======')) {
      mode = 'add'
      rows.push({ type: 'marker', text: line, no: i + 1 })
    } else if (line.startsWith('>>>>>>>')) {
      rows.push({ type: 'marker', text: line, no: i + 1 })
      mode = 'ctx'
    } else {
      rows.push({ type: mode, text: line, no: i + 1 })
    }
  })
  return rows
}

// For each run of deleted lines immediately followed by added lines, pair them
// up and compute a word-level diff so only the changed words are highlighted.
function enrichWords(rows) {
  const out = rows.map((r) => ({ ...r }))
  let k = 0
  while (k < out.length) {
    if (out[k].type !== 'del') {
      k++
      continue
    }
    const dStart = k
    while (k < out.length && out[k].type === 'del') k++
    const aStart = k
    while (k < out.length && out[k].type === 'add') k++
    const pairs = Math.min(aStart - dStart, k - aStart)
    for (let p = 0; p < pairs; p++) {
      const del = out[dStart + p]
      const add = out[aStart + p]
      // Skip intra-line word diff on very long lines — wordDiff has its own hard
      // cap, but this avoids tokenizing huge/minified lines in the first place.
      if (del.text.length > 2000 || add.text.length > 2000) continue
      const wd = wordDiff(del.text, add.text)
      del.parts = wd.old
      add.parts = wd.new
    }
  }
  return out
}

// Turns the flat row list into aligned left/right pairs for the split view.
function toPairs(rows) {
  const out = []
  let k = 0
  while (k < rows.length) {
    const r = rows[k]
    if (r.type === 'hunk') {
      out.push({ kind: 'hunk', text: r.text })
      k++
    } else if (r.type === 'ctx') {
      out.push({ kind: 'pair', left: r, right: r })
      k++
    } else if (r.type === 'del' || r.type === 'add') {
      const dStart = k
      while (k < rows.length && rows[k].type === 'del') k++
      const aStart = k
      while (k < rows.length && rows[k].type === 'add') k++
      const dels = rows.slice(dStart, aStart)
      const adds = rows.slice(aStart, k)
      const n = Math.max(dels.length, adds.length)
      for (let i = 0; i < n; i++) out.push({ kind: 'pair', left: dels[i] || null, right: adds[i] || null })
    } else {
      k++
    }
  }
  return out
}

function LineText({ row }) {
  if (!row) return <span className="dl-text" />
  if (row.parts) {
    return (
      <span className="dl-text">
        {row.parts.map((p, i) => (
          <span key={i} className={p.changed ? 'wd' : undefined}>
            {p.text}
          </span>
        ))}
      </span>
    )
  }
  return <span className="dl-text">{row.text || ' '}</span>
}

export default function DiffView({ diff, mode, view = 'unified', interactive, staged, onStageHunk, onUnstageHunk, busy = false }) {
  const isConflict = mode === 'conflict'
  const notice = diff?.startsWith('GITVISTA_DIFF_NOTICE\n') ? diff.slice('GITVISTA_DIFF_NOTICE\n'.length) : ''
  const binary = /(^|\n)(Binary files .* differ|GIT binary patch)(\n|$)/.test(diff || '')
  const rows = useMemo(() => {
    if (isConflict) return parseConflict(diff || '')
    return enrichWords(parseDiff(diff || ''))
  }, [diff, isConflict])
  const patchable = !!interactive && !isConflict && isPatchable(diff)
  const split = useMemo(() => (patchable ? splitHunks(diff) : null), [patchable, diff])
  const pairs = useMemo(() => (!isConflict && view === 'split' ? toPairs(rows) : null), [rows, view, isConflict])

  if (!diff || !diff.trim()) {
    return <div className="diff-empty">No text changes to show. The file may be binary, empty or unchanged.</div>
  }

  if (notice || binary) {
    return (
      <div className="diff-empty" role="status">
        {notice || 'This file is binary, so a text comparison is not available.'}
      </div>
    )
  }

  if (isConflict) {
    return (
      <div className="diff-view">
        <div className="diff-body">
          {rows.map((r, i) => (
            <div key={i} className={`diff-line dl-${r.type === 'marker' ? 'hunk' : r.type}`}>
              <span className="dl-no">{r.no}</span>
              <span className="dl-text">{r.text || ' '}</span>
            </div>
          ))}
        </div>
      </div>
    )
  }

  // Side-by-side: old version on the left, new on the right, aligned per line.
  if (view === 'split') {
    return (
      <div className="diff-view diff-split">
        <div className="diff-body">
          {pairs.map((row, i) =>
            row.kind === 'hunk' ? (
              <div key={i} className="diff-srow diff-shunk">
                <span className="dl-text">{row.text}</span>
              </div>
            ) : (
              <div key={i} className="diff-srow">
                <div className={'diff-scell' + (row.left ? ` dl-${row.left.type}` : ' dl-empty')}>
                  <span className="dl-no">{row.left ? row.left.oldNo ?? '' : ''}</span>
                  <LineText row={row.left} />
                </div>
                <div className={'diff-scell' + (row.right ? ` dl-${row.right.type}` : ' dl-empty')}>
                  <span className="dl-no">{row.right ? row.right.newNo ?? '' : ''}</span>
                  <LineText row={row.right} />
                </div>
              </div>
            )
          )}
        </div>
      </div>
    )
  }

  // Unified view (default), with optional per-hunk stage/unstage buttons.
  let hunkNo = -1
  return (
    <div className="diff-view">
      <div className="diff-body">
        {rows.map((r, i) => {
          if (r.type === 'hunk') {
            hunkNo += 1
            const hunk = split && split.hunks[hunkNo]
            return (
              <div key={i} className="diff-line dl-hunk diff-hunk-head">
                <span className="dl-text">{r.text}</span>
                {patchable && hunk && (
                  <button
                    className="hunk-btn"
                    disabled={busy}
                    title={staged ? 'Remove this hunk from the next commit' : 'Include this hunk in the next commit'}
                    onClick={() => (staged ? onUnstageHunk : onStageHunk)(buildHunkPatch(split.header, hunk.raw))}
                  >
                    {busy ? <><span className="spinner" aria-hidden="true" /> Updating…</> : staged ? 'Unstage hunk' : 'Stage hunk'}
                  </button>
                )}
              </div>
            )
          }
          return (
            <div key={i} className={`diff-line dl-${r.type}`}>
              <span className="dl-no">{r.oldNo ?? ''}</span>
              <span className="dl-no">{r.newNo ?? ''}</span>
              <span className="dl-sign">{r.type === 'add' ? '+' : r.type === 'del' ? '−' : ''}</span>
              <LineText row={r} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
