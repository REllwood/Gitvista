import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'

export default function BranchTrackingModal({ branch, remoteBranches, busy, onSet, onUnset, onClose }) {
  const preferred = remoteBranches.find((name) => name.endsWith(`/${branch.name}`)) || remoteBranches[0] || ''
  const [upstream, setUpstream] = useState(branch.upstream || preferred)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onClose])

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="tracking-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title" id="tracking-title">Upstream for “{branch.name}”</div>
        <p className="modal-explain">
          The upstream is the remote branch used by plain pull and push. Setting it also enables accurate ahead and behind counts.
        </p>

        {branch.upstream && (
          <div className="tracking-current">
            <span>Currently tracking</span>
            <code>{branch.upstream}</code>
            {branch.upstreamGone && <strong>The remote branch no longer exists.</strong>}
          </div>
        )}

        <label className="modal-field">
          <span>Remote branch</span>
          <select className="modal-input" name="branch-upstream" value={upstream} disabled={busy} onChange={(event) => setUpstream(event.target.value)}>
            {remoteBranches.length === 0 && <option value="">No remote branches available</option>}
            {remoteBranches.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          {remoteBranches.length === 0 && <span className="modal-slug">Fetch a remote first so its branches are available here.</span>}
        </label>

        <div className="modal-command">
          <span className="modal-command-label">Behind the scenes:</span>
          <code>git branch --set-upstream-to={upstream || '&lt;remote/branch&gt;'} {branch.name}</code>
        </div>

        <div className="modal-actions tracking-actions">
          {branch.upstream && (
            <button className="ghost-btn tracking-unset" onClick={() => onUnset(branch.name)} disabled={busy}>
              {busy ? <><span className="spinner" aria-hidden="true" /> Working…</> : 'Stop tracking'}
            </button>
          )}
          <span className="tracking-spacer" />
          <button className="ghost-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="primary-btn" onClick={() => onSet(branch.name, upstream)} disabled={busy || !upstream}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Saving…</> : 'Set upstream'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
