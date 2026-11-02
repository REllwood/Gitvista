import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'

function deriveName(url) {
  const m = (url || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\.git$/i, '')
    .match(/([^/:]+)$/)
  return m ? m[1] : ''
}

// Clone a remote repo into a chosen local folder, then open it as a tab.
export default function CloneModal({ busy, onClone, onCancel, onChooseDir }) {
  const [url, setUrl] = useState('')
  const [dir, setDir] = useState('')
  const [name, setName] = useState('')
  const [choosing, setChoosing] = useState(false)
  const effName = name.trim() || deriveName(url)
  const valid =
    url.trim().length > 0 &&
    dir.length > 0 &&
    effName.length > 0 &&
    effName !== '.' &&
    effName !== '..' &&
    !/[\\/]/.test(effName)

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && !choosing && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, choosing, onCancel])

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && !choosing && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="clone-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="clone-title">Clone a repository</div>
        <p className="modal-explain">
          Make a local copy of a project from GitHub (or any Git host). Paste its URL and choose where to put it.
        </p>

        <label className="modal-field">
          <span>Repository URL</span>
          <input
            className="modal-input"
            name="clone-url"
            autoFocus
            placeholder="https://github.com/owner/repo.git"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy || choosing}
          />
        </label>

        <label className="modal-field">
          <span>Clone into</span>
          <div className="clone-dir">
            <input
              className="modal-input"
              name="clone-parent-folder"
              placeholder="Choose a folder…"
              value={dir}
              onChange={(e) => setDir(e.target.value)}
              disabled={busy || choosing}
            />
            <button
              type="button"
              className="ghost-btn"
              disabled={busy || choosing}
              onClick={async () => {
                setChoosing(true)
                try {
                  const d = await onChooseDir()
                  if (d) setDir(d)
                } finally {
                  setChoosing(false)
                }
              }}
            >
              {choosing ? <><span className="spinner" aria-hidden="true" /> Choosing…</> : 'Browse…'}
            </button>
          </div>
        </label>

        <label className="modal-field">
          <span>Folder name <small>(optional)</small></span>
          <input
            className="modal-input"
            name="clone-folder-name"
            placeholder={deriveName(url) || 'repository'}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={busy || choosing}
          />
          {/[\\/]/.test(effName) && <span className="modal-slug">Use a folder name, not a path.</span>}
        </label>

        {valid && effName && (
          <div className="modal-slug">
            Creates <code>{dir}/{effName}</code>
          </div>
        )}

        <div className="modal-command">
          <span className="modal-command-label">Behind the scenes:</span>
          <code>git clone {url.trim() || '<url>'}</code>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy || choosing}>
            Cancel
          </button>
          <button
            className="primary-btn"
            disabled={!valid || busy || choosing}
            onClick={() => onClone({ url: url.trim(), dir, name: name.trim() })}
          >
            {busy ? <><span className="spinner" aria-hidden="true" /> Cloning…</> : 'Clone'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
