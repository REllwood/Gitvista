import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'

// Add a remote (a named link to a hosted copy, e.g. on GitHub) to the repo.
export default function RemoteModal({ busy, existing = [], onAdd, onCancel }) {
  const suggested = existing.some((r) => r.name === 'origin') ? '' : 'origin'
  const [name, setName] = useState(suggested)
  const [url, setUrl] = useState('')
  const taken = existing.some((r) => r.name === name.trim())
  const valid = name.trim().length > 0 && url.trim().length > 0 && !taken

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="add-remote-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="add-remote-title">Add a remote</div>
        <p className="modal-explain">
          A remote is a named link to a hosted copy of this project (usually called <code>origin</code>). Once added,
          you can push your commits up to it and pull others' down.
        </p>

        <label className="modal-field">
          <span>Name</span>
          <input className="modal-input" name="remote-name" value={name} placeholder="origin" onChange={(e) => setName(e.target.value)} disabled={busy} />
          {taken && <span className="modal-slug">A remote named “{name.trim()}” already exists. Pick another name.</span>}
        </label>

        <label className="modal-field">
          <span>URL</span>
          <input
            className="modal-input"
            name="remote-url"
            autoFocus
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </label>

        <div className="modal-command">
          <span className="modal-command-label">Behind the scenes:</span>
          <code>
            git remote add {name.trim() || '<name>'} {url.trim() || '<url>'}
          </code>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            className="primary-btn"
            disabled={!valid || busy}
            onClick={() => onAdd({ name: name.trim(), url: url.trim() })}
          >
            {busy ? <><span className="spinner" aria-hidden="true" /> Adding…</> : 'Add remote'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
