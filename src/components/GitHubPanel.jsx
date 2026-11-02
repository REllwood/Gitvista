import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import Icon from './Icon'
import { relativeTime, shortHash } from '../lib/format'

function GitHubAvatar({ user, size = 28 }) {
  if (user?.avatarUrl) return <img className="github-avatar" src={user.avatarUrl} width={size} height={size} alt="" referrerPolicy="no-referrer" />
  return <span className="github-avatar github-avatar-fallback" style={{ width: size, height: size }}>{(user?.login || '?')[0].toUpperCase()}</span>
}

function Labels({ labels }) {
  return (
    <span className="github-labels">
      {(labels || []).map((label) => (
        <span key={label.name} style={label.colour ? { borderColor: label.colour } : undefined}>{label.name}</span>
      ))}
    </span>
  )
}

export default function GitHubPanel({ repoPath, onClose, onCreate, onSettings, toast }) {
  const [tab, setTab] = useState('pulls')
  const [pullData, setPullData] = useState(null)
  const [issues, setIssues] = useState(null)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [detailLoading, setDetailLoading] = useState(false)
  const [error, setError] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeMethod, setMergeMethod] = useState('squash')
  const [mergeBusy, setMergeBusy] = useState(false)
  const [reviewBody, setReviewBody] = useState('')
  const [reviewEvent, setReviewEvent] = useState('COMMENT')
  const [reviewBusy, setReviewBusy] = useState(false)
  const [openingUrl, setOpeningUrl] = useState(null)

  const unwrap = async (promise) => {
    const result = await promise
    if (!result?.ok) throw new Error(result?.error || 'GitHub request failed.')
    return result.data
  }

  const loadPulls = async (keepSelection = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await unwrap(window.api.listGitHubPullRequests(repoPath))
      setPullData(data)
      if (!keepSelection || !data.pulls.some((pull) => pull.number === selectedNumber)) {
        setSelectedNumber(data.pulls[0]?.number || null)
      }
    } catch (loadError) {
      setError(loadError?.message || 'Pull requests could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  const loadIssues = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await unwrap(window.api.listGitHubIssues(repoPath))
      setIssues(data)
    } catch (loadError) {
      setError(loadError?.message || 'Issues could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadPulls()
    // Initial load is tied to the repository for the lifetime of this panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoPath])

  useEffect(() => {
    if (tab === 'issues' && !issues && !loading) loadIssues()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  useEffect(() => {
    let alive = true
    if (!selectedNumber || tab !== 'pulls') {
      setDetail(null)
      return undefined
    }
    setDetailLoading(true)
    setError(null)
    setMergeOpen(false)
    window.api.getGitHubPullRequest(repoPath, selectedNumber)
      .then((result) => {
        if (!alive) return
        if (result?.ok) setDetail(result.data)
        else setError(result?.error || 'Pull request details could not be loaded.')
      })
      .catch((loadError) => {
        if (alive) setError(loadError?.message || 'Pull request details could not be loaded.')
      })
      .finally(() => {
        if (alive) setDetailLoading(false)
      })
    return () => {
      alive = false
    }
  }, [repoPath, selectedNumber, tab])

  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape' && !mergeBusy && !reviewBusy) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mergeBusy, reviewBusy, onClose])

  const openExternal = async (url) => {
    setOpeningUrl(url)
    try {
      await unwrap(window.api.openExternal(url))
    } catch (openError) {
      toast('error', openError?.message || 'The GitHub page could not be opened.')
    } finally {
      setOpeningUrl(null)
    }
  }

  const mergePull = async () => {
    setMergeBusy(true)
    try {
      await unwrap(window.api.mergeGitHubPullRequest(repoPath, detail.number, mergeMethod, detail.head.sha))
      toast('success', `Merged pull request #${detail.number}.`)
      setDetail(null)
      setMergeOpen(false)
      await loadPulls()
    } catch (mergeError) {
      toast('error', mergeError?.message || 'The pull request could not be merged.')
    } finally {
      setMergeBusy(false)
    }
  }

  const submitReview = async () => {
    setReviewBusy(true)
    try {
      await unwrap(window.api.createGitHubReview(repoPath, detail.number, reviewEvent, reviewBody.trim(), detail.head.sha))
      toast('success', reviewEvent === 'APPROVE' ? 'Review approved.' : reviewEvent === 'REQUEST_CHANGES' ? 'Changes requested.' : 'Review comment submitted.')
      setReviewBody('')
      const refreshed = await unwrap(window.api.getGitHubPullRequest(repoPath, detail.number))
      setDetail(refreshed)
    } catch (reviewError) {
      toast('error', reviewError?.message || 'The review could not be submitted.')
    } finally {
      setReviewBusy(false)
    }
  }

  const authenticated = pullData?.authenticated || issues?.authenticated

  return (
    <ModalOverlay className="modal-overlay github-overlay" onClick={() => !mergeBusy && !reviewBusy && onClose()}>
      <section className="github-panel" role="dialog" aria-modal="true" aria-labelledby="github-title" onClick={(event) => event.stopPropagation()}>
        <header className="github-head">
          <div>
            <span className="file-inspector-kicker">GitHub</span>
            <h2 id="github-title">{pullData?.repository ? `${pullData.repository.owner}/${pullData.repository.repo}` : 'Repository collaboration'}</h2>
          </div>
          <div className="github-head-actions">
            <button className="ghost-btn" onClick={() => tab === 'pulls' ? loadPulls(true) : loadIssues()} disabled={loading}>
              {loading ? <><span className="spinner" /> Refreshing…</> : <><Icon name="refresh" size={13} /> Refresh</>}
            </button>
            <button className="activity-close" onClick={onClose} aria-label="Close GitHub panel"><Icon name="x" /></button>
          </div>
        </header>

        {!authenticated && !loading && !error && (
          <div className="github-auth-banner">
            <span>Public read-only mode. Save a fine-grained GitHub token to review, merge, and access private repositories.</span>
            <button onClick={onSettings}>Open Settings</button>
          </div>
        )}

        <div className="github-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'pulls'} className={tab === 'pulls' ? 'active' : ''} onClick={() => setTab('pulls')}>Pull requests</button>
          <button role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} onClick={() => setTab('issues')}>Issues</button>
          <span />
          <button className="github-create" onClick={onCreate}><Icon name="plus" size={13} /> Create pull request</button>
        </div>

        {error ? (
          <div className="inspector-status inspector-error" role="alert">
            <strong>GitHub could not be loaded</strong>
            <span>{error}</span>
            <button className="primary-btn" onClick={() => tab === 'pulls' ? loadPulls() : loadIssues()}>Try again</button>
          </div>
        ) : loading && !pullData ? (
          <div className="inspector-status" role="status"><span className="spinner" /> Loading GitHub…</div>
        ) : tab === 'issues' ? (
          <div className="github-issues">
            {loading && <div className="github-inline-loading"><span className="spinner" /> Loading issues…</div>}
            {!loading && issues?.issues?.length === 0 && <div className="inspector-status">No open issues.</div>}
            {(issues?.issues || []).map((issue) => (
              <button key={issue.number} className="github-issue-row" onClick={() => openExternal(issue.htmlUrl)} disabled={openingUrl === issue.htmlUrl}>
                <GitHubAvatar user={issue.author} />
                <span className="github-list-main">
                  <strong>#{issue.number} {issue.title}</strong>
                  <small>{issue.author.login} · updated {relativeTime(Date.parse(issue.updatedAt))} · {issue.comments} comments</small>
                  <Labels labels={issue.labels} />
                </span>
                {openingUrl === issue.htmlUrl ? <span className="spinner" /> : <Icon name="eye" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="github-content">
            <aside className="github-pr-list">
              {pullData?.pulls?.length === 0 && <div className="inspector-status">No open pull requests.</div>}
              {(pullData?.pulls || []).map((pull) => (
                <button key={pull.number} className={selectedNumber === pull.number ? 'selected' : ''} onClick={() => setSelectedNumber(pull.number)}>
                  <GitHubAvatar user={pull.author} />
                  <span className="github-list-main">
                    <strong>#{pull.number} {pull.title}</strong>
                    <small>{pull.author.login} · {pull.base.ref} ← {pull.head.ref} · {relativeTime(Date.parse(pull.updatedAt))}</small>
                    <Labels labels={pull.labels} />
                  </span>
                  {pull.draft && <span className="github-draft">Draft</span>}
                </button>
              ))}
            </aside>

            <main className="github-pr-detail">
              {detailLoading ? (
                <div className="inspector-status" role="status"><span className="spinner" /> Loading pull request…</div>
              ) : !detail ? (
                <div className="inspector-status">Select a pull request to inspect it.</div>
              ) : (
                <>
                  <div className="github-detail-head">
                    <div>
                      <span className="github-pr-number">Pull request #{detail.number}</span>
                      <h3>{detail.title}</h3>
                      <div className="github-detail-author"><GitHubAvatar user={detail.author} size={22} /> {detail.author.login}</div>
                    </div>
                    <button className="ghost-btn" onClick={() => openExternal(detail.htmlUrl)} disabled={openingUrl === detail.htmlUrl}>
                      {openingUrl === detail.htmlUrl ? <><span className="spinner" /> Opening…</> : 'Open on GitHub'}
                    </button>
                  </div>

                  <div className="github-pr-facts">
                    <span><strong>{detail.commits}</strong> commits</span>
                    <span><strong>{detail.changedFiles}</strong> files</span>
                    <span className="add">+{detail.additions}</span>
                    <span className="del">−{detail.deletions}</span>
                    <span className={`github-ci github-ci-${detail.ci.state}`}>{detail.ci.state === 'success' ? 'Checks passed' : detail.ci.state === 'failure' ? `${detail.ci.failed} checks failed` : detail.ci.state === 'pending' ? 'Checks running' : 'No checks reported'}</span>
                  </div>
                  <div className="github-branches"><code>{detail.base.ref}</code><span>←</span><code>{detail.head.ref}</code><small>{shortHash(detail.head.sha)}</small></div>
                  {detail.body && <div className="github-pr-body">{detail.body}</div>}

                  <section className="github-reviews">
                    <h4>Reviews</h4>
                    {detail.reviews.length === 0 && <p>No reviews submitted yet.</p>}
                    {detail.reviews.map((review) => (
                      <div key={review.id} className="github-review">
                        <GitHubAvatar user={review.author} size={22} />
                        <span><strong>{review.author.login}</strong><small>{review.state.replace(/_/g, ' ').toLowerCase()}</small>{review.body && <p>{review.body}</p>}</span>
                      </div>
                    ))}
                  </section>

                  <section className="github-review-form">
                    <h4>Submit a review</h4>
                    <textarea name="github-review-body" value={reviewBody} disabled={reviewBusy} onChange={(event) => setReviewBody(event.target.value)} placeholder="Write a concise review…" rows={3} />
                    <div>
                      <select name="github-review-event" value={reviewEvent} disabled={reviewBusy} onChange={(event) => setReviewEvent(event.target.value)}>
                        <option value="COMMENT">Comment</option>
                        <option value="APPROVE">Approve</option>
                        <option value="REQUEST_CHANGES">Request changes</option>
                      </select>
                      <button className="primary-btn" onClick={submitReview} disabled={reviewBusy || (reviewEvent !== 'APPROVE' && !reviewBody.trim()) || !detail.authenticated}>
                        {reviewBusy ? <><span className="spinner" /> Submitting…</> : 'Submit review'}
                      </button>
                    </div>
                  </section>

                  <section className="github-merge-zone">
                    {!mergeOpen ? (
                      <button className="primary-btn" onClick={() => setMergeOpen(true)} disabled={!detail.authenticated || detail.draft || detail.mergeable === false || detail.ci.state === 'failure'}>Review merge options</button>
                    ) : (
                      <div className="github-merge-confirm">
                        <strong>Merge pull request #{detail.number}?</strong>
                        <p>GitVista will require the head commit to remain at <code>{shortHash(detail.head.sha)}</code>, preventing a newly-pushed change from being merged without review.</p>
                        <select name="github-merge-method" value={mergeMethod} disabled={mergeBusy} onChange={(event) => setMergeMethod(event.target.value)}>
                          <option value="squash">Squash and merge</option>
                          <option value="merge">Create a merge commit</option>
                          <option value="rebase">Rebase and merge</option>
                        </select>
                        <div><button className="ghost-btn" onClick={() => setMergeOpen(false)} disabled={mergeBusy}>Cancel</button><button className="primary-btn" onClick={mergePull} disabled={mergeBusy}>{mergeBusy ? <><span className="spinner" /> Merging…</> : 'Merge on GitHub'}</button></div>
                      </div>
                    )}
                  </section>
                </>
              )}
            </main>
          </div>
        )}
      </section>
    </ModalOverlay>
  )
}
