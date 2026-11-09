import Avatar from './Avatar'
import Term from './Term'
import Icon from './Icon'
import useResource from '../hooks/useResource'
import { shortHash, fullDate, relativeTime } from '../lib/format'

const SIGNATURES = {
  G: { label: 'Verified signature', kind: 'good' },
  U: { label: 'Valid signature, untrusted identity', kind: 'warn' },
  X: { label: 'Valid signature, expired signature', kind: 'warn' },
  Y: { label: 'Valid signature, expired key', kind: 'warn' },
  R: { label: 'Valid signature, revoked key', kind: 'warn' },
  B: { label: 'Bad signature', kind: 'bad' },
  E: { label: 'Signature could not be checked', kind: 'warn' },
  N: { label: 'Unsigned', kind: 'neutral' },
}

// The right-panel view for a single commit: who made it, when, the full
// message, which files changed ("who pushed / what changed"), and quick
// actions (branch here, tag, cherry-pick, revert).
export default function CommitDetails({ repo, hash, commitOverride, onOpenDiff, onFileHistory, onCommitAction }) {
  const commit = repo.commits.find((c) => c.hash === hash) || (commitOverride?.hash === hash ? commitOverride : null)
  // The loader tags its result with the commit it belongs to, so a newly
  // selected commit never shows the previous commit's files, even for a frame.
  const files = useResource(
    async () => {
      const res = await window.api.getCommitFiles(repo.path, hash)
      if (!res?.ok) throw new Error(res?.error || 'The changed files could not be loaded.')
      return { hash, ...(res.data || { files: [], body: '' }) }
    },
    [repo.path, hash],
    { enabled: !!hash }
  )
  const info = files.data?.hash === hash ? files.data : null
  const loadError = files.status === 'failed' ? files.error : null
  const loading = !info && !loadError

  if (!commit) {
    return <div className="panel-empty">Select any commit in the graph to see who made it and what changed.</div>
  }

  const a = commit.author || {}
  const c = commit.committer || {}
  const sameCommitter = c.email === a.email && c.name === a.name
  const parentDesc =
    commit.parents.length === 0
      ? 'none (this is the first commit)'
      : commit.parents.length >= 2
        ? `${commit.parents.length} (this is a merge)`
        : commit.parents.map((p) => shortHash(p)).join(', ')

  return (
    <div className="commit-details">
      <div className="cd-subject">{commit.subject}</div>

      <div className="cd-meta">
        <Avatar name={a.name} email={a.email} size={36} />
        <div className="cd-who">
          <div>
            <strong>{a.name || 'Unknown'}</strong> authored this <Term id="commit">commit</Term>
          </div>
          <div className="cd-sub">
            {fullDate(commit.timestamp)} · {relativeTime(commit.timestamp)}
          </div>
          {!sameCommitter && <div className="cd-sub">Committed by {c.name}</div>}
        </div>
      </div>

      <div className="cd-actions">
        <button onClick={() => onCommitAction?.('switch', commit)} title="Move HEAD here to look around">
          <Icon name="switch" size={13} /> Switch here
        </button>
        <button onClick={() => onCommitAction?.('branchAt', commit)} title="Start a new branch from this commit">
          <Icon name="branch" size={13} /> Branch
        </button>
        <button onClick={() => onCommitAction?.('tag', commit)} title="Tag this commit">
          <Icon name="tag" size={13} /> Tag
        </button>
        <button onClick={() => onCommitAction?.('cherryPick', commit)} title="Copy this commit onto your current branch">
          <Icon name="copy" size={13} /> Cherry-pick
        </button>
        <button onClick={() => onCommitAction?.('revert', commit)} title="Add a commit that undoes this one">
          <Icon name="undo" size={13} /> Revert
        </button>
      </div>

      <div className="cd-rows">
        <div className="cd-row">
          <span className="cd-key">ID</span>
          <code>{shortHash(commit.hash)}</code>
        </div>
        <div className="cd-row">
          <span className="cd-key">Built on</span>
          <span>{parentDesc}</span>
        </div>
        {info?.signature && (
          <div className="cd-row">
            <span className="cd-key">Signature</span>
            <span
              className={`signature-badge signature-${(SIGNATURES[info.signature.status] || SIGNATURES.E).kind}`}
              title={[info.signature.signer, info.signature.key && `Key ${info.signature.key}`].filter(Boolean).join(' · ')}
            >
              {(SIGNATURES[info.signature.status] || SIGNATURES.E).label}
            </span>
          </div>
        )}
        {commit.refs?.length > 0 && (
          <div className="cd-row">
            <span className="cd-key">Labels</span>
            <span className="cd-refs">
              {commit.refs.map((r, i) => (
                <span key={i} className={`ref-badge ref-${r.type}`}>
                  {r.name}
                </span>
              ))}
            </span>
          </div>
        )}
      </div>

      {info?.body && info.body.trim() !== commit.subject.trim() && <pre className="cd-body">{info.body}</pre>}

      <div className="cd-files-head">
        {loading ? <span role="status"><span className="spinner" aria-hidden="true" /> Loading changed files…</span> : loadError ? 'Changed files' : `${info?.files?.length || 0} file${info?.files?.length === 1 ? '' : 's'} changed`}
      </div>
      <div className="cd-files" data-state={files.status}>
        {loading && !info?.files?.length && [62, 48, 36].map((width) => (
          <div key={width} className="cd-file-skeleton" aria-hidden="true">
            <span className="skeleton" style={{ width: `${width}%` }} />
            <span className="skeleton" style={{ width: 38 }} />
          </div>
        ))}
        {loadError && (
          <div className="commit-files-error" role="alert">
            <span>{loadError}</span>
            <button className="link-btn" onClick={() => files.reload()}>Try again</button>
          </div>
        )}
        {info?.files?.map((f, i) => (
          <div key={i} className="cd-file">
            <button className="cd-file-open" onClick={() => onOpenDiff?.(f.path, f.previousPath)} title={`View changes to ${f.path}`}>
              <span className="cd-file-path">{f.previousPath ? `${f.previousPath} → ${f.path}` : f.path}</span>
              <span className="cd-file-stat">
                {f.additions != null && <span className="add">+{f.additions}</span>}
                {f.deletions != null && <span className="del">−{f.deletions}</span>}
              </span>
            </button>
            <button
              className="cd-file-history"
              title="Show this file's history and blame"
              aria-label={`Show history for ${f.path}`}
              onClick={(event) => {
                event.stopPropagation()
                onFileHistory?.(f.path)
              }}
            >
              <Icon name="history" size={13} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
