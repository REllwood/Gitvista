import ModalOverlay from './ModalOverlay'
import { useEffect, useMemo, useState } from 'react'
import { slugifyBranch } from '../lib/slug'

function folderForBranch(branch) {
  return slugifyBranch(branch).replace(/\//g, '-') || 'git-worktree'
}

export default function WorktreeModal({ repo, busy, onChooseParent, onCreate, onClose }) {
  const occupiedBranches = new Set((repo.worktrees || []).map((worktree) => worktree.branch).filter(Boolean))
  const availableBranches = (repo.localBranches || []).map((branch) => branch.name).filter((name) => !occupiedBranches.has(name))
  const startRefs = useMemo(
    () => [...new Set(['HEAD', ...(repo.localBranches || []).map((branch) => branch.name), ...(repo.remoteBranches || []).map((branch) => branch.name), ...(repo.tags || [])])],
    [repo.localBranches, repo.remoteBranches, repo.tags]
  )
  const [mode, setMode] = useState('new')
  const [parentDir, setParentDir] = useState('')
  const [choosing, setChoosing] = useState(false)
  const [newBranch, setNewBranch] = useState('feature/worktree')
  const [existingRef, setExistingRef] = useState(availableBranches[0] || '')
  const [startRef, setStartRef] = useState('HEAD')
  const [folderName, setFolderName] = useState(folderForBranch('feature/worktree'))
  const [folderEdited, setFolderEdited] = useState(false)
  const [openAfter, setOpenAfter] = useState(true)

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy && !choosing) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, choosing, onClose])

  const chooseParent = async () => {
    setChoosing(true)
    try {
      const selected = await onChooseParent()
      if (selected) setParentDir(selected)
    } finally {
      setChoosing(false)
    }
  }
  const branchName = slugifyBranch(newBranch)
  const ref = mode === 'new' ? startRef : existingRef
  const valid = !!parentDir && !!folderName.trim() && !/[\\/]/.test(folderName) && !!ref && (mode !== 'new' || !!branchName)

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !busy && !choosing && onClose()}>
      <div className="modal worktree-modal" role="dialog" aria-modal="true" aria-labelledby="worktree-title" onClick={(event) => event.stopPropagation()}>
        <div className="modal-title" id="worktree-title">Add a worktree</div>
        <p className="modal-explain">
          A worktree checks out another branch into a separate folder, so you can work on two branches at once without stashing or switching.
        </p>

        <div className="worktree-mode" role="radiogroup" aria-label="Worktree branch mode">
          <label><input type="radio" name="worktree-mode" checked={mode === 'new'} disabled={busy || choosing} onChange={() => setMode('new')} /> Create a new branch</label>
          <label><input type="radio" name="worktree-mode" checked={mode === 'existing'} disabled={busy || choosing} onChange={() => setMode('existing')} /> Use an available branch</label>
        </div>

        {mode === 'new' ? (
          <>
            <label className="modal-field">
              <span>New branch</span>
              <input
                className="modal-input"
                name="worktree-new-branch"
                autoFocus
                value={newBranch}
                disabled={busy || choosing}
                onChange={(event) => {
                  setNewBranch(event.target.value)
                  if (!folderEdited) setFolderName(folderForBranch(event.target.value))
                }}
              />
              <span className="modal-slug">Will be created as <code>{branchName || 'branch-name'}</code></span>
            </label>
            <label className="modal-field">
              <span>Start from</span>
              <select className="modal-input" name="worktree-start-ref" value={startRef} disabled={busy || choosing} onChange={(event) => setStartRef(event.target.value)}>
                {startRefs.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
          </>
        ) : (
          <label className="modal-field">
            <span>Available local branch</span>
            <select className="modal-input" name="worktree-existing-branch" value={existingRef} disabled={busy || choosing} onChange={(event) => {
              setExistingRef(event.target.value)
              if (!folderEdited) setFolderName(folderForBranch(event.target.value))
            }}>
              {availableBranches.length === 0 && <option value="">Every local branch is already checked out</option>}
              {availableBranches.map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
          </label>
        )}

        <label className="modal-field">
          <span>Parent folder</span>
          <div className="clone-dir">
            <input className="modal-input" name="worktree-parent-folder" value={parentDir} readOnly placeholder="Choose a parent folder…" />
            <button className="ghost-btn" onClick={chooseParent} disabled={busy || choosing}>
              {choosing ? <><span className="spinner" aria-hidden="true" /> Choosing…</> : 'Choose…'}
            </button>
          </div>
        </label>

        <label className="modal-field">
          <span>New folder name</span>
          <input className="modal-input" name="worktree-folder-name" value={folderName} disabled={busy || choosing} onChange={(event) => {
            setFolderEdited(true)
            setFolderName(event.target.value)
          }} />
          {/[\\/]/.test(folderName) && <span className="modal-slug">Use a folder name, not a path.</span>}
        </label>

        <label className="modal-toggle">
          <input type="checkbox" name="worktree-open-after" checked={openAfter} disabled={busy || choosing} onChange={(event) => setOpenAfter(event.target.checked)} />
          <span>Open the new worktree in a GitVista tab</span>
        </label>

        <div className="modal-command">
          <span className="modal-command-label">Behind the scenes:</span>
          <code>{mode === 'new' ? `git worktree add -b ${branchName || '<branch>'} <folder> ${startRef}` : `git worktree add <folder> ${existingRef || '<branch>'}`}</code>
        </div>

        <div className="modal-actions">
          <button className="ghost-btn" onClick={onClose} disabled={busy || choosing}>Cancel</button>
          <button
            className="primary-btn"
            disabled={!valid || busy || choosing}
            onClick={() => onCreate({ parentDir, folderName: folderName.trim(), ref, newBranch: mode === 'new' ? branchName : null, openAfter })}
          >
            {busy ? <><span className="spinner" aria-hidden="true" /> Creating…</> : 'Create worktree'}
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
