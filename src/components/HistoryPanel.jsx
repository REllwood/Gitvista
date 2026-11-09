import Icon from './Icon'
import ModalOverlay from './ModalOverlay'
import useResource from '../hooks/useResource'
import { shortHash, relativeTime } from '../lib/format'

// Slide-in reflog browser — Git's safety net. Lists every recent move of HEAD
// (commit, reset, rebase, merge, checkout…) newest-first, and lets you restore
// your branch to any earlier point to undo a mistake.
export default function HistoryPanel({ repoPath, onRestore, onClose }) {
  const reflog = useResource(async () => {
    const result = await window.api.getReflog(repoPath)
    if (!result?.ok) throw new Error(result?.error || 'History could not be loaded.')
    return result.data || []
  }, [repoPath])
  const entries = reflog.data || []
  return (
    <ModalOverlay className="help-overlay" onClick={onClose}>
      <aside className="help-panel history-panel" aria-label="History and undo" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span>History &amp; undo</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close history">
            <Icon name="x" />
          </button>
        </div>
        <div className="help-body" data-state={reflog.status}>
          <p className="history-intro">
            Git records every move of your current position (HEAD) here. Restore any earlier point to undo a mistake.
            The newest entry is at the top.
          </p>
          {(reflog.status === 'loading' || reflog.status === 'idle') && (
            <div className="side-empty" role="status"><span className="spinner" aria-hidden="true" /> Loading history…</div>
          )}
          {reflog.status === 'failed' && (
            <div className="side-empty compare-error" role="alert">
              <span>{reflog.error}</span>
              <button className="link-btn" onClick={() => reflog.reload()}>Try again</button>
            </div>
          )}
          {reflog.status === 'ready' && entries.length === 0 && <div className="side-empty">No history recorded yet.</div>}
          {entries.map((e, i) => (
            <div key={i} className={'reflog-item' + (i === 0 ? ' current' : '')}>
              <div className="reflog-main">
                <span className="reflog-action">{e.action}</span>
                <span className="reflog-subject">{e.subject}</span>
              </div>
              <div className="reflog-meta">
                <code title={e.selector}>{shortHash(e.hash)}</code>
                <span className="reflog-when">{relativeTime(e.timestamp)}</span>
                {i === 0 ? (
                  <span className="reflog-now">you are here</span>
                ) : (
                  <button className="reflog-restore" onClick={() => onRestore(e)} title="Move your branch back to this point">
                    Restore
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </aside>
    </ModalOverlay>
  )
}
