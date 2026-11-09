import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import DiffView from './DiffView'
import Icon from './Icon'
import useResource from '../hooks/useResource'
import { shortHash } from '../lib/format'

// Compares any two points in history (commits / branches / tags): a list of the
// files that differ, with the chosen file's diff (unified or side-by-side). The
// file list and the selected file's diff load separately, so each pane shows
// its own loading, error and empty state. Escape is answered by ModalOverlay.
export default function CompareModal({ repoPath, a, b, aLabel, bLabel, onClose }) {
  const [sel, setSel] = useState(null)
  const [view, setView] = useState('unified')

  const changed = useResource(async () => {
    const result = await window.api.getChangedBetween(repoPath, a, b)
    if (!result?.ok) throw new Error(result?.error || 'The comparison could not be loaded.')
    return result.data || []
  }, [repoPath, a, b])
  const files = changed.data
  const selected = files?.find((file) => file.path === sel) || null

  const diff = useResource(
    async () => {
      const result = await window.api.getDiffBetween(repoPath, a, b, selected.path, selected.previousPath)
      if (!result?.ok) throw new Error(result?.error || 'The file comparison could not be loaded.')
      return { path: selected.path, text: result.data || '' }
    },
    [repoPath, a, b, selected?.path],
    { enabled: !!selected }
  )

  // Select the first changed file whenever a new comparison loads.
  useEffect(() => {
    if (files) setSel(files[0]?.path ?? null)
  }, [files])

  const diffText = diff.data?.path === sel ? diff.data.text : null

  return (
    <ModalOverlay className="modal-overlay" onClick={onClose}>
      <div className="modal compare-modal" role="dialog" aria-modal="true" aria-labelledby="compare-title" onClick={(e) => e.stopPropagation()}>
        <div className="diff-modal-head">
          <span className="diff-modal-file" id="compare-title">
            <Icon name="eye" size={14} />
            Comparing <code>{aLabel || shortHash(a)}</code> → <code>{bLabel || shortHash(b)}</code>
          </span>
          <div className="diff-modal-tools">
            <div className="diff-view-toggle">
              <button className={view === 'unified' ? 'active' : ''} onClick={() => setView('unified')}>
                Unified
              </button>
              <button className={view === 'split' ? 'active' : ''} onClick={() => setView('split')}>
                Side&#8209;by&#8209;side
              </button>
            </div>
            <button className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="x" />
            </button>
          </div>
        </div>
        <div className="compare-body">
          <div className="compare-files" data-state={changed.status}>
            {(changed.status === 'loading' || changed.status === 'idle') && <div className="side-empty" role="status"><span className="spinner" aria-hidden="true" /> Loading files…</div>}
            {changed.status === 'failed' && <div className="side-empty compare-error" role="alert"><span>{changed.error}</span><button className="link-btn" onClick={() => changed.reload()}>Try again</button></div>}
            {files && files.length === 0 && <div className="side-empty">No differences between these two points.</div>}
            {files &&
              files.map((f) => (
                <div
                  key={f.path}
                  className={'compare-file' + (sel === f.path ? ' active' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSel(f.path)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSel(f.path)
                    }
                  }}
                  title={f.path}
                >
                  <span className="compare-file-path">{f.previousPath ? `${f.previousPath} → ${f.path}` : f.path}</span>
                  <span className="cd-file-stat">
                    {f.additions != null && <span className="add">+{f.additions}</span>}
                    {f.deletions != null && <span className="del">−{f.deletions}</span>}
                  </span>
                </div>
              ))}
          </div>
          <div className="compare-diff" data-state={selected ? diff.status : 'idle'}>
            {!selected ? (
              <div className="diff-empty">{files?.length ? 'Choose a file to see its changes.' : ''}</div>
            ) : diff.status === 'failed' ? (
              <div className="diff-error" role="alert"><div className="diff-error-title">Could not display this comparison</div><div className="diff-error-body">{diff.error}</div><button className="primary-btn" onClick={() => diff.reload()}>Try again</button></div>
            ) : diffText === null ? (
              <div className="diff-empty" role="status"><span className="spinner" aria-hidden="true" /> Loading comparison…</div>
            ) : (
              <DiffView diff={diffText} mode="diff" view={view} />
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
