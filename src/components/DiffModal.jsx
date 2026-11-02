import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import DiffView from './DiffView'
import Icon from './Icon'

export default function DiffModal({ state, onClose, onRetry, onStageHunk, onUnstageHunk, busy }) {
  const [view, setView] = useState('unified')
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  if (!state) return null
  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal diff-modal" role="dialog" aria-modal="true" aria-label={`Changes to ${state.fileName}`} onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-head">
          <span className="diff-modal-file">
            <Icon name={state.kind === 'conflict' ? 'alert' : 'commit'} size={14} />
            {state.fileName}
            {state.kind === 'conflict' && <span className="diff-conflict-tag">conflict</span>}
            {state.interactive && view === 'unified' && (
              <span className="diff-side-tag">{state.staged ? 'staged — click a hunk to unstage' : 'working — click a hunk to stage'}</span>
            )}
          </span>
          <div className="diff-modal-tools">
            {state.kind !== 'conflict' && (
              <div className="diff-view-toggle">
                <button className={view === 'unified' ? 'active' : ''} onClick={() => setView('unified')} title="Unified view">
                  Unified
                </button>
                <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')} title="Side-by-side view">
                  Side&#8209;by&#8209;side
                </button>
              </div>
            )}
            <button className="icon-btn" disabled={busy} onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="diff-modal-body">
          {state.loading ? (
            <div className="diff-empty diff-loading" role="status">
              <span className="spinner" aria-hidden="true" />
              Loading changes…
            </div>
          ) : state.error ? (
            <div className="diff-error" role="alert">
              <div className="diff-error-title">Could not display this comparison</div>
              <div className="diff-error-body">{state.error}</div>
              <button className="primary-btn" onClick={onRetry}>
                Try again
              </button>
            </div>
          ) : (
            <DiffView
              diff={state.content}
              busy={busy}
              mode={state.kind}
              view={view}
              interactive={state.interactive}
              staged={state.staged}
              onStageHunk={onStageHunk}
              onUnstageHunk={onUnstageHunk}
            />
          )}
        </div>
      </div>
    </ModalOverlay>
  )
}
