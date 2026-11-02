import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { parseGitHubRemote, buildCompareUrl } from '../lib/github'

// Opens a GitHub pull request: pushes the branch if needed, then launches the
// GitHub "compare" page with the title pre-filled. No GitHub login required.
export default function PRModal({ repo, busy, onConfirm, onCancel }) {
  const origin = repo.remotes.find((r) => r.name === 'origin') || repo.remotes[0]
  const info = origin ? parseGitHubRemote(origin.url) : null
  const head = repo.currentBranch
  const others = repo.localBranches.map((b) => b.name).filter((b) => b !== head)
  const defaultBase = others.includes('main') ? 'main' : others.includes('master') ? 'master' : others[0] || 'main'

  const [base, setBase] = useState(defaultBase)
  const [title, setTitle] = useState(repo.commits[0]?.subject || head || '')

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && !busy && onCancel()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  if (!info || !info.isGitHub) {
    return (
      <ModalOverlay className="modal-overlay" onClick={() => !busy && onCancel()}>
        <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pull-request-title" onClick={(e) => e.stopPropagation()}>
          <div className="modal-title" id="pull-request-title">Create a Pull Request</div>
          <p className="modal-explain">
            Pull requests open on GitHub, but this repository’s remote{' '}
            {origin ? (
              <>
                is <code>{origin.url}</code>, which is not GitHub.
              </>
            ) : (
              "is not set, so there is no remote to open a pull request against."
            )}
          </p>
          <div className="modal-actions">
            <button className="primary-btn" onClick={onCancel}>
              OK
            </button>
          </div>
        </div>
      </ModalOverlay>
    )
  }

  const status = repo.status || {}
  const needsPush = !status.tracking || (status.ahead || 0) > 0
  const url = buildCompareUrl({ ...info, base, head, title })
  const valid = head && base && base !== head

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="pull-request-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="pull-request-title">Create a Pull Request</div>
        <p className="modal-explain">
          A pull request asks <strong>{info.owner}/{info.repo}</strong> to review and merge your branch. GitVista will{' '}
          {needsPush ? 'push your branch and ' : ''}open GitHub with the details pre-filled.
        </p>

        <div className="pr-rows">
          <div className="pr-row">
            <span className="pr-label">From</span>
            <span className="pr-branch">
              <Icon name="branch" size={12} /> {head}
            </span>
          </div>
          <div className="pr-row">
            <span className="pr-label">Into</span>
            <select className="modal-input pr-select" name="pull-request-base" value={base} onChange={(e) => setBase(e.target.value)} disabled={busy}>
              {[defaultBase, ...others.filter((b) => b !== defaultBase)].map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        <label className="modal-field">
          <span>Title</span>
          <input className="modal-input" name="pull-request-title" value={title} onChange={(e) => setTitle(e.target.value)} disabled={busy} />
        </label>

        {base === head && <p className="modal-note">Pick a different “Into” branch. A branch cannot be merged into itself.</p>}

        <p className="modal-note">
          {needsPush
            ? 'Your branch has commits that are not on GitHub yet. GitVista will push them first so the pull request includes them.'
            : 'Your branch is already up to date on GitHub.'}
        </p>

        <div className="modal-command">
          <span className="modal-command-label">Opens:</span>
          <code className="pr-url">{url}</code>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button className="primary-btn" disabled={!valid || busy} onClick={() => onConfirm({ url, needsPush })}>
            {busy ? <><span className="spinner" aria-hidden="true" /> Working…</> : needsPush ? 'Push & open GitHub' : 'Open GitHub'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
