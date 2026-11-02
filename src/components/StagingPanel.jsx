import { useMemo, useState } from 'react'
import { computeGraph } from '../lib/graphLayout'
import { previewCommit } from '../lib/preview'
import GraphSvg from './GraphSvg'
import Term from './Term'
import Icon from './Icon'
import { changedFileCount } from '../lib/repositorySession'
import { normaliseCoAuthor } from '../lib/commitMessage'

const MINI = { rowHeight: 24, laneWidth: 13, padX: 12, nodeR: 5 }
const STATUS_LETTER = { modified: 'M', added: 'A', deleted: 'D', renamed: 'R', untracked: 'U', conflicted: '!' }

function FileRow({ file, actionLabel, onAction, onDiscard, onOpen, onHistory, busy }) {
  return (
    <div className="file-row">
      <button className="file-open" onClick={() => onOpen?.(file.path)} title={`View changes to ${file.path}`} disabled={busy}>
        <span className={`file-status fs-${file.status}`} title={file.status}>
          {STATUS_LETTER[file.status] || 'M'}
        </span>
        <span className="file-path" title={file.previousPath ? `${file.previousPath} → ${file.path}` : file.path}>{file.path}</span>
      </button>
      {onDiscard && (
        <button
          className="file-btn discard"
          title="Discard changes to this file"
          disabled={busy}
          onClick={(e) => {
            e.stopPropagation()
            onDiscard(file)
          }}
        >
          <Icon name="undo" size={13} />
        </button>
      )}
      <button
        className="file-btn file-history-btn"
        title="Show this file's history and blame"
        aria-label={`Show history for ${file.path}`}
        disabled={busy}
        onClick={(event) => {
          event.stopPropagation()
          onHistory?.(file)
        }}
      >
        <Icon name="history" size={13} />
      </button>
      <button
        className="file-btn file-stage-btn"
        aria-label={`${actionLabel} ${file.path}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation()
          onAction(file)
        }}
      >
        {actionLabel}
      </button>
    </div>
  )
}

// Working-changes view: stage/unstage files, write a message, and see a LIVE
// preview of where the new commit will land before pressing Commit.
export default function StagingPanel({
  repo,
  message,
  onMessage,
  coAuthors = [],
  onAddCoAuthor,
  onRemoveCoAuthor,
  onStage,
  onUnstage,
  onStageAll,
  onUnstageAll,
  onDiscard,
  onCommit,
  onOpenDiff,
  onFileHistory,
  busy,
  commitBusy = false,
}) {
  const [coAuthorOpen, setCoAuthorOpen] = useState(false)
  const [coAuthorName, setCoAuthorName] = useState('')
  const [coAuthorEmail, setCoAuthorEmail] = useState('')
  const [coAuthorError, setCoAuthorError] = useState('')
  const status = repo.status || {}
  const staged = status.staged || []
  const unstaged = [...(status.unstaged || []), ...(status.untracked || [])]
  const canCommit = staged.length > 0 && message.trim().length > 0 && !busy && !commitBusy && !repo.conflict?.conflictedFiles?.length

  const preview = useMemo(() => {
    const { commits } = previewCommit(repo, message)
    return computeGraph(commits.slice(0, 3))
  }, [repo, message])

  function addCoAuthor(event) {
    event.preventDefault()
    const author = normaliseCoAuthor({ name: coAuthorName, email: coAuthorEmail })
    if (!author) {
      setCoAuthorError('Enter a name and a valid email address.')
      return
    }
    if (coAuthors.some((candidate) => candidate.email.toLocaleLowerCase() === author.email.toLocaleLowerCase())) {
      setCoAuthorError('That co-author is already included.')
      return
    }
    onAddCoAuthor?.(author)
    setCoAuthorName('')
    setCoAuthorEmail('')
    setCoAuthorError('')
  }

  return (
    <div className="staging-panel">
      <div className="staging-summary"><Icon name={status.clean ? 'check' : 'commit'} size={15} />{status.clean ? 'All changes committed' : `${changedFileCount(status)} changed files to review`}</div>
      <div className="sp-section">
        <div className="sp-head">
          <span>Unstaged changes<span className="sp-count">{unstaged.length}</span></span>
          {unstaged.length > 0 && (
            <button className="link-btn" onClick={onStageAll} disabled={busy}>
              Stage all
            </button>
          )}
        </div>
        <div className="file-list">
          {unstaged.length === 0 && <div className="file-empty">No other changes right now.</div>}
          {unstaged.map((f, i) => (
            <FileRow
              key={i}
              file={f}
              actionLabel="Stage"
              onAction={onStage}
              onDiscard={onDiscard}
              onOpen={(filePath) => onOpenDiff?.(filePath, false, f.status === 'untracked')}
              onHistory={onFileHistory}
              busy={busy}
            />
          ))}
        </div>
      </div>

      <div className="sp-section">
        <div className="sp-head">
          <span>
            <Term id="stage">Staged for commit</Term><span className="sp-count">{staged.length}</span>
          </span>
          {staged.length > 0 && (
            <button className="link-btn" onClick={onUnstageAll} disabled={busy}>
              Unstage all
            </button>
          )}
        </div>
        <div className="file-list">
          {staged.length === 0 && (
            <div className="file-empty">Choose files above to include in your next commit.</div>
          )}
          {staged.map((f, i) => (
            <FileRow
              key={i}
              file={f}
              actionLabel="Unstage"
              onAction={onUnstage}
              onOpen={(filePath) => onOpenDiff?.(filePath, true)}
              onHistory={onFileHistory}
              busy={busy}
            />
          ))}
        </div>
      </div>

      <div className="sp-commit">
        <label htmlFor="commit-message" className="commit-label">Commit message<span>Draft kept with this repository</span></label>
        <textarea
          className="commit-msg"
          id="commit-message"
          name="commit-message"
          aria-label="Commit message"
          placeholder="Summary of your changes…"
          value={message}
          onChange={(e) => onMessage(e.target.value)}
          disabled={busy}
          rows={3}
        />
        <div className="co-authors">
          <button
            className="co-author-toggle"
            type="button"
            aria-expanded={coAuthorOpen}
            disabled={busy}
            onClick={() => setCoAuthorOpen((open) => !open)}
          >
            Co-authors{coAuthors.length ? ` (${coAuthors.length})` : ''}
            <span aria-hidden="true">{coAuthorOpen ? '−' : '+'}</span>
          </button>
          {coAuthors.length > 0 && (
            <div className="co-author-list" aria-label="Commit co-authors">
              {coAuthors.map((author) => (
                <span className="co-author-chip" key={author.email.toLocaleLowerCase()}>
                  <span>{author.name}</span>
                  <button type="button" onClick={() => onRemoveCoAuthor?.(author.email)} aria-label={`Remove ${author.name} as co-author`} disabled={busy}>
                    <Icon name="x" size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {coAuthorOpen && (
            <form className="co-author-form" onSubmit={addCoAuthor}>
              <p>Credit another contributor using Git’s standard co-author trailer.</p>
              <input
                className="modal-input"
                name="co-author-name"
                autoComplete="name"
                value={coAuthorName}
                placeholder="Contributor name"
                aria-label="Co-author name"
                disabled={busy}
                onChange={(event) => {
                  setCoAuthorName(event.target.value)
                  setCoAuthorError('')
                }}
              />
              <input
                className="modal-input"
                name="co-author-email"
                type="email"
                autoComplete="email"
                value={coAuthorEmail}
                placeholder="contributor@example.com"
                aria-label="Co-author email"
                disabled={busy}
                onChange={(event) => {
                  setCoAuthorEmail(event.target.value)
                  setCoAuthorError('')
                }}
              />
              <div className="co-author-form-foot">
                {coAuthorError ? <span className="co-author-error" role="alert">{coAuthorError}</span> : <span />}
                <button className="ghost-btn" type="submit" disabled={busy}>Add co-author</button>
              </div>
            </form>
          )}
        </div>
        {staged.length > 0 && <details className="sp-preview" open>
          <summary><Icon name="commit" size={13} />Preview your next commit</summary>
          <div className="sp-preview-graph">
            <GraphSvg nodes={preview.nodes} edges={preview.edges} laneCount={preview.laneCount} geom={MINI}
              labelFor={(node) => (node.ghost ? '+ ' : '') + (node.subject || 'Your new commit').split('\n')[0].slice(0, 34)} />
          </div>
        </details>}
        <button className="primary-btn commit-btn" disabled={!canCommit} onClick={onCommit}>
          {commitBusy ? <><span className="spinner" aria-hidden="true" /> Committing…</> : `Commit ${staged.length} file${staged.length === 1 ? '' : 's'}`}
        </button>
        {staged.length === 0 && <div className="sp-hint">Stage at least one file to commit.</div>}
        {staged.length > 0 && message.trim().length === 0 && (
          <div className="sp-hint">Add a short message describing your change.</div>
        )}
      </div>
    </div>
  )
}
