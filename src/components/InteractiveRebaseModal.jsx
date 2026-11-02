import ModalOverlay from './ModalOverlay'
import { useMemo, useState, useEffect, useRef } from 'react'
import { computeGraph } from '../lib/graphLayout'
import { simulateRebaseTodo } from '../lib/preview'
import GraphSvg from './GraphSvg'
import Icon from './Icon'
import { shortHash } from '../lib/format'

const MINI = { rowHeight: 24, laneWidth: 13, padX: 12, nodeR: 5 }
const ACTIONS = [
  { value: 'pick', label: 'Pick — keep as is' },
  { value: 'reword', label: 'Reword — change message' },
  { value: 'squash', label: 'Squash — merge into the one above (keep both messages)' },
  { value: 'fixup', label: 'Fixup — merge into the one above (drop this message)' },
  { value: 'drop', label: 'Drop — remove this commit' },
]

// The interactive-rebase editor. Rows are ordered oldest→newest (top→bottom, the
// order git applies them). Drag or use the arrows to reorder; pick an action per
// commit; the graph previews the rewritten history live.
export default function InteractiveRebaseModal({ base, baseLabel, repo, commits, busy, onConfirm, onCancel }) {
  const [items, setItems] = useState(() =>
    commits.map((c) => ({ hash: c.hash, subject: c.subject, action: 'pick', message: c.subject }))
  )
  const dragIdx = useRef(null)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel, busy])

  const move = (from, to) => {
    if (to < 0 || to >= items.length) return
    setItems((prev) => {
      const a = [...prev]
      const [x] = a.splice(from, 1)
      a.splice(to, 0, x)
      return a
    })
  }
  const setAction = (i, action) => setItems((prev) => prev.map((it, k) => (k === i ? { ...it, action } : it)))
  const setMessage = (i, message) => setItems((prev) => prev.map((it, k) => (k === i ? { ...it, message } : it)))

  const firstKept = items.find((it) => it.action !== 'drop')
  const invalidFirst = firstKept && (firstKept.action === 'squash' || firstKept.action === 'fixup')
  const allDropped = !firstKept

  const preview = useMemo(() => simulateRebaseTodo(repo, base, items), [repo, base, items])
  const graph = useMemo(() => computeGraph(preview.commits.slice(0, 12)), [preview])

  const handleDrop = (i) => {
    const from = dragIdx.current
    if (from != null && from !== i) move(from, i)
    dragIdx.current = null
  }

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="modal irebase-modal" role="dialog" aria-modal="true" aria-labelledby="irebase-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="irebase-title">Rewrite history</div>
        <p className="modal-explain">
          Reorder, squash, drop, or reword the commits from <code>{baseLabel}</code> up to now. Drag a row (or use the
          arrows) to reorder. The preview shows the result. These become brand-new commits (new ids), so avoid this on
          work you've already shared.
        </p>

        <div className="irebase-list">
          {items.map((it, i) => (
            <div
              key={it.hash}
              className={'irebase-row act-' + it.action}
              draggable={!busy}
              onDragStart={() => (dragIdx.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => handleDrop(i)}
            >
              <span className="irebase-grip" title="Drag to reorder">
                <Icon name="rebase" size={13} />
              </span>
              <div className="irebase-updown">
                <button onClick={() => move(i, i - 1)} disabled={busy || i === 0} title="Move up">
                  <Icon name="push" size={11} />
                </button>
                <button onClick={() => move(i, i + 1)} disabled={busy || i === items.length - 1} title="Move down">
                  <Icon name="pull" size={11} />
                </button>
              </div>
              <code className="irebase-hash">{shortHash(it.hash)}</code>
              <select className="irebase-action" name={`rebase-action-${i}`} value={it.action} onChange={(e) => setAction(i, e.target.value)} disabled={busy}>
                {ACTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </select>
              {it.action === 'reword' ? (
                <input
                  className="irebase-msg modal-input"
                  name={`rebase-message-${i}`}
                  value={it.message}
                  disabled={busy}
                  onChange={(e) => setMessage(i, e.target.value)}
                  placeholder="New commit message…"
                />
              ) : (
                <span className={'irebase-subj' + (it.action === 'drop' ? ' dropped' : '')}>{it.subject}</span>
              )}
            </div>
          ))}
        </div>

        {invalidFirst && (
          <p className="modal-note">
            The first kept commit can’t be “squash” or “fixup” — there’s nothing above it to combine into.
          </p>
        )}

        <div className="modal-preview">
          <div className="modal-preview-label">Preview — your history after rewriting:</div>
          <div className="modal-preview-graph">
            <GraphSvg
              nodes={graph.nodes}
              edges={graph.edges}
              laneCount={graph.laneCount}
              geom={MINI}
              labelFor={(n) => (n.ghost ? '+ ' : '') + (n.subject || '').slice(0, 42)}
            />
          </div>
        </div>
        {preview.note && <p className="modal-note">{preview.note}</p>}

        <div className="modal-command">
          <span className="modal-command-label">Behind the scenes:</span>
          <code>git rebase -i {baseLabel}</code>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary-btn"
            disabled={busy || invalidFirst || allDropped}
            onClick={() => onConfirm(items.map(({ hash, action, message }) => ({ hash, action, message })))}
          >
            {busy ? <><span className="spinner" aria-hidden="true" /> Rewriting…</> : 'Rewrite history'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
