import { useEffect } from 'react'
import Icon from './Icon'
import { shortHash, relativeTime } from '../lib/format'

// Slide-in reflog browser — Git's safety net. Lists every recent move of HEAD
// (commit, reset, rebase, merge, checkout…) newest-first, and lets you restore
// your branch to any earlier point to undo a mistake.
export default function HistoryPanel({ entries, onRestore, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="help-overlay" onClick={onClose}>
      <aside className="help-panel history-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span>History &amp; undo</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close history">
            <Icon name="x" />
          </button>
        </div>
        <div className="help-body">
          <p className="history-intro">
            Git records every move of your current position (HEAD) here. Restore any earlier point to undo a mistake.
            The newest entry is at the top.
          </p>
          {entries.length === 0 && <div className="side-empty">No history recorded yet.</div>}
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
    </div>
  )
}
