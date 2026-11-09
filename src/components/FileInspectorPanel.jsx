import ModalOverlay from './ModalOverlay'
import { useState } from 'react'
import useResource from '../hooks/useResource'
import Avatar from './Avatar'
import Icon from './Icon'
import { relativeTime, shortHash } from '../lib/format'

const BLAME_PAGE_SIZE = 250

export default function FileInspectorPanel({ repoPath, file, refName, onClose, onOpenDiff, onSelectCommit }) {
  const [tab, setTab] = useState('history')
  const [blameWanted, setBlameWanted] = useState(false)
  const [visibleBlame, setVisibleBlame] = useState(BLAME_PAGE_SIZE)

  // History and blame load separately and keep their results while you switch
  // tabs. Blame loads the first time its tab opens. Escape is answered by
  // ModalOverlay.
  const unwrap = (kind, fallback) => async (promise) => {
    const result = await promise
    if (!result?.ok) throw new Error(result?.error || `The file ${kind} could not be loaded.`)
    return result.data || fallback
  }
  const historyResource = useResource(
    () => unwrap('history', [])(window.api.getFileHistory(repoPath, file, refName || null)),
    [repoPath, file, refName]
  )
  const blameResource = useResource(
    () => unwrap('blame', { lines: [], truncated: false })(window.api.getFileBlame(repoPath, file, refName || null)),
    [repoPath, file, refName],
    { enabled: blameWanted }
  )
  const shown = tab === 'history' ? historyResource : blameResource
  const history = historyResource.data
  const blame = blameResource.data

  const switchTab = (nextTab) => {
    setTab(nextTab)
    if (nextTab === 'blame') setBlameWanted(true)
  }
  const blameLines = blame?.lines || []

  return (
    <ModalOverlay className="modal-overlay" onClick={onClose}>
      <section
        className="file-inspector"
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-inspector-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="file-inspector-head">
          <div className="file-inspector-heading">
            <span className="file-inspector-kicker">File insights</span>
            <h2 id="file-inspector-title">{file}</h2>
            {refName && <code>at {shortHash(refName)}</code>}
          </div>
          <button className="activity-close" onClick={onClose} aria-label="Close file insights">
            <Icon name="x" />
          </button>
        </header>

        <div className="file-inspector-tabs" role="tablist" aria-label="File insights">
          <button role="tab" aria-selected={tab === 'history'} className={tab === 'history' ? 'active' : ''} onClick={() => switchTab('history')}>
            History
          </button>
          <button role="tab" aria-selected={tab === 'blame'} className={tab === 'blame' ? 'active' : ''} onClick={() => switchTab('blame')}>
            Blame
          </button>
        </div>

        <div className="file-inspector-body" data-state={shown.status}>
          {shown.status === 'loading' || shown.status === 'idle' ? (
            <div className="inspector-status" role="status">
              <span className="spinner" aria-hidden="true" /> Loading {tab}…
            </div>
          ) : shown.status === 'failed' ? (
            <div className="inspector-status inspector-error" role="alert">
              <strong>Could not load {tab}</strong>
              <span>{shown.error}</span>
              <button className="primary-btn" onClick={() => shown.reload()}>Try again</button>
            </div>
          ) : tab === 'history' ? (
            <div className="file-history-list">
              {history?.length === 0 && <div className="inspector-status">No committed history was found for this file.</div>}
              {history?.map((commit) => (
                <button key={commit.hash} className="file-history-row" onClick={() => onOpenDiff(commit.path || file, commit.hash, commit.previousPath)}>
                  <Avatar name={commit.author?.name} email={commit.author?.email} size={28} />
                  <span className="file-history-main">
                    <strong>{commit.subject || 'Commit without a subject'}</strong>
                    <span>{commit.author?.name || 'Unknown author'} · {relativeTime(commit.timestamp)}</span>
                  </span>
                  <code>{shortHash(commit.hash)}</code>
                  <span className="file-history-action">View change</span>
                </button>
              ))}
            </div>
          ) : (
            <div className="blame-view">
              {blameLines.length === 0 && <div className="inspector-status">No lines are available to blame.</div>}
              {blameLines.slice(0, visibleBlame).map((line) => (
                <button
                  key={`${line.line}-${line.hash}`}
                  className="blame-row"
                  disabled={line.uncommitted}
                  onClick={() => {
                    onSelectCommit(line.hash)
                    onClose()
                  }}
                  title={line.uncommitted ? 'This line has not been committed yet' : line.subject}
                >
                  <span className="blame-line-number">{line.line}</span>
                  <code className="blame-hash">{line.uncommitted ? 'working' : shortHash(line.hash)}</code>
                  <span className="blame-author">{line.uncommitted ? 'Not committed' : line.author?.name || 'Unknown'}</span>
                  <code className="blame-content">{line.content || ' '}</code>
                </button>
              ))}
              {visibleBlame < blameLines.length && (
                <button className="blame-more" onClick={() => setVisibleBlame((count) => count + BLAME_PAGE_SIZE)}>
                  Show {Math.min(BLAME_PAGE_SIZE, blameLines.length - visibleBlame)} more lines
                </button>
              )}
              {blame?.truncated && <div className="blame-capped">Showing the first 5,000 lines to keep the app responsive.</div>}
            </div>
          )}
        </div>
      </section>
    </ModalOverlay>
  )
}
