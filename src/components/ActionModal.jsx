import ModalOverlay from './ModalOverlay'
import { useMemo, useState, useEffect } from 'react'
import { computeGraph } from '../lib/graphLayout'
import { buildPreview } from '../lib/preview'
import { refRows } from '../lib/graphCommits'
import { getActionMeta } from '../lib/actions'
import { slugifyBranch } from '../lib/slug'
import GraphSvg from './GraphSvg'

const MINI = { rowHeight: 24, laneWidth: 13, padX: 12, nodeR: 5 }

// Branch-style names get slugified to a valid git name; tags/messages are taken as-is.
const SLUGGED = new Set(['branch', 'branchAt', 'renameBranch', 'renameRemote'])

// One modal for every non-trivial action. Shows a plain explanation, an
// optional input (a slugged "name", or free "text"), an optional toggle, a live
// preview of the resulting graph, the equivalent git command, and confirm/cancel.
// Confirming hands a finalized action back up.
export default function ActionModal({ action, repo, busy, onConfirm, onCancel }) {
  const base = getActionMeta(action, repo)
  const inputKind = base.needsInput // 'name' | 'text' | undefined
  const [value, setValue] = useState(action.name ?? base.initialValue ?? '')
  const [toggleOn, setToggleOn] = useState(!!(base.toggle && base.toggle.default))

  const shouldSlug = inputKind === 'name' && SLUGGED.has(action.type)
  const finalValue = inputKind === 'name' ? (shouldSlug ? slugifyBranch(value) : value.trim()) : value

  let effAction = action
  if (inputKind === 'name') effAction = { ...action, name: finalValue }
  else if (inputKind === 'text') effAction = { ...action, [base.inputField || 'message']: finalValue }
  if (base.toggle) effAction = { ...effAction, [base.toggle.key]: toggleOn }

  const meta = getActionMeta(effAction, repo)
  const valid =
    inputKind === 'name'
      ? finalValue.length > 0
      : inputKind === 'text' && !base.optional
        ? finalValue.trim().length > 0
        : true

  const preview = useMemo(
    () => (meta.graphPreview ? buildPreview(repo, effAction) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [repo, action, value, toggleOn]
  )
  const graph = useMemo(() => (preview ? computeGraph(preview.commits.slice(0, 9)) : null), [preview])
  // Where each branch label sits before the action, so a label that moves can
  // glide from its old commit to its new one in the preview.
  const refOrigins = useMemo(() => (graph ? refRows(graph.nodes, repo?.commits) : null), [graph, repo])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onCancel()
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && valid && !busy) onConfirm(effAction)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div className={'modal' + (meta.destructive ? ' modal-danger' : '')} role="dialog" aria-modal="true" aria-labelledby="action-modal-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="action-modal-title">{meta.title}</div>
        <p className="modal-explain">{meta.explain}</p>

        {inputKind && (
          <label className="modal-field">
            <span>{meta.inputLabel}</span>
            <input
              className="modal-input"
              name="git-action-input"
              autoFocus
              value={value}
              placeholder={shouldSlug ? 'Type it however you like, e.g. “My login page”' : meta.inputPlaceholder}
              onChange={(e) => setValue(e.target.value)}
            />
            {shouldSlug && (
              <span className="modal-slug">
                {finalValue ? (
                  <>
                    Will be used as <code>{finalValue}</code>
                  </>
                ) : (
                  'Use any words. GitVista turns them into a valid branch name.'
                )}
              </span>
            )}
          </label>
        )}

        {base.toggle && (
          <label className="modal-toggle">
            <input type="checkbox" name="git-action-option" checked={toggleOn} onChange={(e) => setToggleOn(e.target.checked)} />
            <span>{base.toggle.label}</span>
          </label>
        )}

        {graph && (
          <div className="modal-preview">
            <div className="modal-preview-label">What your history will look like:</div>
            <div className="modal-preview-graph">
              <GraphSvg
                nodes={graph.nodes}
                edges={graph.edges}
                laneCount={graph.laneCount}
                geom={MINI}
                labelFor={(n) => (n.ghost ? '+ ' : '') + (n.subject || '').slice(0, 42)}
                refOrigins={refOrigins}
              />
            </div>
          </div>
        )}

        {preview?.note && <p className="modal-note">{preview.note}</p>}

        {meta.command && (
          <div className="modal-command">
            <span className="modal-command-label">Behind the scenes:</span>
            <code>{meta.command}</code>
          </div>
        )}

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className={meta.destructive ? 'danger-btn' : 'primary-btn'}
            disabled={!valid || busy}
            onClick={() => onConfirm(effAction)}
          >
            {busy ? <><span className="spinner" aria-hidden="true" /> Working…</> : meta.confirmLabel}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
