import ModalOverlay from './ModalOverlay'
import { useEffect, useRef, useState } from 'react'
import DiffView from './DiffView'
import Icon from './Icon'
import { shortHash } from '../lib/format'

// Compares any two points in history (commits / branches / tags): a list of the
// files that differ, with the chosen file's diff (unified or side-by-side).
export default function CompareModal({ repoPath, a, b, aLabel, bLabel, onClose }) {
  const [files, setFiles] = useState(null)
  const [sel, setSel] = useState(null)
  const [diff, setDiff] = useState('')
  const [loadingDiff, setLoadingDiff] = useState(false)
  const [filesError, setFilesError] = useState(null)
  const [diffError, setDiffError] = useState(null)
  const [retry, setRetry] = useState(0)
  const [view, setView] = useState('unified')
  const diffRequest = useRef(0)

  useEffect(() => {
    let alive = true
    let loadedFiles = false
    const requestId = ++diffRequest.current
    setFiles(null)
    setFilesError(null)
    setDiffError(null)
    setDiff('')
    setSel(null)
    setLoadingDiff(false)
    ;(async () => {
      try {
        const changed = await window.api.getChangedBetween(repoPath, a, b)
        if (!changed?.ok) throw new Error(changed?.error || 'The comparison could not be loaded.')
        if (!alive || requestId !== diffRequest.current) return
        const list = changed.data || []
        loadedFiles = true
        setFiles(list)
        if (list[0]) {
          setSel(list[0].path)
          setLoadingDiff(true)
          const result = await window.api.getDiffBetween(repoPath, a, b, list[0].path, list[0].previousPath)
          if (!result?.ok) throw new Error(result?.error || 'The file comparison could not be loaded.')
          if (alive && requestId === diffRequest.current) setDiff(result.data || '')
        }
      } catch (error) {
        if (!alive || requestId !== diffRequest.current) return
        if (!loadedFiles) setFilesError(error?.message || 'The comparison could not be loaded.')
        else setDiffError(error?.message || 'The file comparison could not be loaded.')
      } finally {
        if (alive && requestId === diffRequest.current) setLoadingDiff(false)
      }
    })()
    return () => {
      alive = false
      diffRequest.current += 1
    }
  }, [repoPath, a, b, retry])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function selectFile(file) {
    const path = file?.path || file
    const previousPath = file?.previousPath || null
    const requestId = ++diffRequest.current
    setSel(path)
    setLoadingDiff(true)
    setDiffError(null)
    setDiff('')
    try {
      const r = await window.api.getDiffBetween(repoPath, a, b, path, previousPath)
      if (!r?.ok) throw new Error(r?.error || 'The file comparison could not be loaded.')
      if (requestId === diffRequest.current) setDiff(r.data || '')
    } catch (error) {
      if (requestId === diffRequest.current) setDiffError(error?.message || 'The file comparison could not be loaded.')
    } finally {
      if (requestId === diffRequest.current) setLoadingDiff(false)
    }
  }

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
          <div className="compare-files">
            {files == null && !filesError && <div className="side-empty" role="status"><span className="spinner" aria-hidden="true" /> Loading files…</div>}
            {filesError && <div className="side-empty compare-error" role="alert"><span>{filesError}</span><button className="link-btn" onClick={() => setRetry((value) => value + 1)}>Try again</button></div>}
            {files && files.length === 0 && <div className="side-empty">No differences between these two points.</div>}
            {files &&
              files.map((f) => (
                <div
                  key={f.path}
                  className={'compare-file' + (sel === f.path ? ' active' : '')}
                  role="button"
                  tabIndex={0}
                  onClick={() => selectFile(f)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      selectFile(f)
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
          <div className="compare-diff">
            {loadingDiff ? (
              <div className="diff-empty" role="status"><span className="spinner" aria-hidden="true" /> Loading comparison…</div>
            ) : diffError ? (
              <div className="diff-error" role="alert"><div className="diff-error-title">Could not display this comparison</div><div className="diff-error-body">{diffError}</div><button className="primary-btn" onClick={() => sel && selectFile(files?.find((file) => file.path === sel) || sel)}>Try again</button></div>
            ) : (
              <DiffView diff={diff} mode="diff" view={view} />
            )}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
