import Icon from './Icon'
import Term from './Term'

// Shown across the top of the graph while an operation is paused for conflicts.
export function ConflictBanner({ repo, onAbort, busy }) {
  const c = repo.conflict || {}
  const n = c.conflictedFiles?.length || 0
  return (
    <div className="conflict-banner">
      <Icon name="alert" />
      <span>
        <strong>{c.inProgress ? `A ${c.inProgress} is paused.` : 'Conflicts need resolving.'}</strong> {n} file{n === 1 ? '' : 's'} need{n === 1 ? 's' : ''} your
        attention. Resolve {n === 1 ? 'it' : 'them'} in the panel on the right.
      </span>
      {c.inProgress && <button onClick={onAbort} disabled={busy}>Abort</button>}
    </div>
  )
}

// The right-panel workflow for resolving conflicts: pick a side per file (or
// edit by hand), then finish or abort the whole operation.
export default function ConflictPanel({ repo, busy, onResolve, onMarkResolved, onView, onOpenFile, onAbort, onContinue }) {
  const conflict = repo.conflict || {}
  const files = conflict.conflictedFiles || []
  const op = conflict.inProgress || 'operation'
  const done = files.length === 0

  return (
    <div className="conflict-panel">
      <div className="conflict-intro">
        <div className="conflict-title">
          <Icon name="alert" />
          {files.length} <Term id="conflict">conflict</Term>
          {files.length === 1 ? '' : 's'} to resolve
        </div>
        <p>
          Git combined what it could, but could not decide how to combine these files during the {op}. For each file,
          choose which version to keep, or edit it by hand and click “Mark resolved”. Then finish the {op}.
        </p>
      </div>

      <div className="conflict-files">
        {files.map((f) => (
          <div key={f} className="conflict-file">
            <div className="cf-path">
              <Icon name="alert" size={13} /> {f}
            </div>
            <div className="cf-actions">
              <button disabled={busy} onClick={() => onResolve(f, 'ours')} title="Keep the version from your current branch">
                Keep current
              </button>
              <button disabled={busy} onClick={() => onResolve(f, 'theirs')} title="Keep the incoming version">
                Keep incoming
              </button>
              <button className="cf-ghost" disabled={busy} onClick={() => onView(f)} title="View the conflicted file">
                <Icon name="eye" size={13} />
              </button>
              <button className="cf-ghost" disabled={busy} onClick={() => onOpenFile(f)} title="Open in your default editor">
                Edit
              </button>
              <button
                className="cf-ghost"
                disabled={busy}
                onClick={() => onMarkResolved(f)}
                title="I edited this file by hand. Mark it resolved."
              >
                Mark resolved
              </button>
            </div>
          </div>
        ))}
        {done && (
          <div className="conflict-done">
            <Icon name="check" /> All conflicts resolved. You can finish now.
          </div>
        )}
      </div>

      {conflict.inProgress && <div className="conflict-actions">
        <button className="ghost-btn" onClick={onAbort} disabled={busy}>
          Abort {op}
        </button>
        <button className="primary-btn" onClick={onContinue} disabled={busy || !done}>
          {busy ? <><span className="spinner" aria-hidden="true" /> Working…</> : `Finish ${op}`}
        </button>
      </div>}
    </div>
  )
}
