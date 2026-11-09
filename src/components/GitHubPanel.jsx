import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import useMachine from '../hooks/useMachine'
import useResource from '../hooks/useResource'
import { operationMachine } from '../lib/machines'
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
  const [issuesWanted, setIssuesWanted] = useState(false)
  const [selectedNumber, setSelectedNumber] = useState(null)
  const [mergeOpen, setMergeOpen] = useState(false)
  const [mergeMethod, setMergeMethod] = useState('squash')
  const [reviewBody, setReviewBody] = useState('')
  const [reviewEvent, setReviewEvent] = useState('COMMENT')
  const [openingUrl, setOpeningUrl] = useState(null)
  // One review or merge at a time. While one runs, the selection, tabs, Refresh
  // and Close are locked, so the result always lands on the pull request it
  // was started for.
  const [action, sendAction] = useMachine(operationMachine)
  const acting = action.value === 'running'
  const mergeBusy = action.context.kind === 'merge'
  const reviewBusy = action.context.kind === 'review'

  const unwrap = async (promise) => {
    const result = await promise
    if (!result?.ok) throw new Error(result?.error || 'GitHub request failed.')
    return result.data
  }

  const pulls = useResource(() => unwrap(window.api.listGitHubPullRequests(repoPath)), [repoPath], { keepData: true })
  const issues = useResource(() => unwrap(window.api.listGitHubIssues(repoPath)), [repoPath], { enabled: issuesWanted, keepData: true })
  const detail = useResource(() => unwrap(window.api.getGitHubPullRequest(repoPath, selectedNumber)), [repoPath, selectedNumber], {
    enabled: selectedNumber != null,
  })
  const pullData = pulls.data
  const pullDetail = detail.data?.number === selectedNumber ? detail.data : null

  // Keep the selection on a pull request that is still open, or pick the first.
  useEffect(() => {
    const list = pullData?.pulls
    if (!list) return
    if (!list.some((pull) => pull.number === selectedNumber)) setSelectedNumber(list[0]?.number ?? null)
  }, [pullData, selectedNumber])

  // A new selection starts with an empty review form and the merge closed.
  useEffect(() => {
    setMergeOpen(false)
    setReviewBody('')
    setReviewEvent('COMMENT')
  }, [selectedNumber])

  const showTab = (next) => {
    if (acting) return
    setTab(next)
    if (next === 'issues') setIssuesWanted(true)
  }

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
    if (!pullDetail || !sendAction({ type: 'START', kind: 'merge' })) return
    try {
      await unwrap(window.api.mergeGitHubPullRequest(repoPath, pullDetail.number, mergeMethod, pullDetail.head.sha))
      toast('success', `Merged pull request #${pullDetail.number}.`)
      setMergeOpen(false)
      pulls.reload()
    } catch (mergeError) {
      toast('error', mergeError?.message || 'The pull request could not be merged.')
    } finally {
      sendAction({ type: 'FINISH' })
    }
  }

  const submitReview = async () => {
    if (!pullDetail || !sendAction({ type: 'START', kind: 'review' })) return
    try {
      await unwrap(window.api.createGitHubReview(repoPath, pullDetail.number, reviewEvent, reviewBody.trim(), pullDetail.head.sha))
      toast('success', reviewEvent === 'APPROVE' ? 'Review approved.' : reviewEvent === 'REQUEST_CHANGES' ? 'Changes requested.' : 'Review comment submitted.')
      setReviewBody('')
      detail.reload()
    } catch (reviewError) {
      toast('error', reviewError?.message || 'The review could not be submitted.')
    } finally {
      sendAction({ type: 'FINISH' })
    }
  }

  const listed = tab === 'pulls' ? pulls : issues
  const authenticated = pullData?.authenticated || issues.data?.authenticated

  return (
    <ModalOverlay className="modal-overlay github-overlay" onClick={() => !acting && onClose()}>
      <section className="github-panel" role="dialog" aria-modal="true" aria-labelledby="github-title" data-state={listed.status} data-action={acting ? action.context.kind : 'idle'} onClick={(event) => event.stopPropagation()}>
        <header className="github-head">
          <div>
            <span className="file-inspector-kicker">GitHub</span>
            <h2 id="github-title">{pullData?.repository ? `${pullData.repository.owner}/${pullData.repository.repo}` : 'Repository collaboration'}</h2>
          </div>
          <div className="github-head-actions">
            <button className="ghost-btn" onClick={() => listed.reload()} disabled={acting || listed.status === 'loading'}>
              {listed.status === 'loading' ? <><span className="spinner" /> Refreshing…</> : <><Icon name="refresh" size={13} /> Refresh</>}
            </button>
            <button className="activity-close" onClick={onClose} disabled={acting} aria-label="Close GitHub panel"><Icon name="x" /></button>
          </div>
        </header>

        {!authenticated && listed.status === 'ready' && (
          <div className="github-auth-banner">
            <span>Public read-only mode. Save a fine-grained GitHub token to review, merge, and access private repositories.</span>
            <button onClick={onSettings}>Open Settings</button>
          </div>
        )}

        <div className="github-tabs" role="tablist">
          <button role="tab" aria-selected={tab === 'pulls'} className={tab === 'pulls' ? 'active' : ''} disabled={acting} onClick={() => showTab('pulls')}>Pull requests</button>
          <button role="tab" aria-selected={tab === 'issues'} className={tab === 'issues' ? 'active' : ''} disabled={acting} onClick={() => showTab('issues')}>Issues</button>
          <span />
          <button className="github-create" onClick={onCreate}><Icon name="plus" size={13} /> Create pull request</button>
        </div>

        {listed.status === 'failed' ? (
          <div className="inspector-status inspector-error" role="alert">
            <strong>{tab === 'pulls' ? 'Pull requests could not be loaded' : 'Issues could not be loaded'}</strong>
            <span>{listed.error}</span>
            <button className="primary-btn" onClick={() => listed.reload()}>Try again</button>
          </div>
        ) : !listed.data ? (
          <div className="inspector-status" role="status"><span className="spinner" /> {tab === 'pulls' ? 'Loading pull requests…' : 'Loading issues…'}</div>
        ) : tab === 'issues' ? (
          <div className="github-issues">
            {issues.status === 'loading' && <div className="github-inline-loading"><span className="spinner" /> Loading issues…</div>}
            {issues.status === 'ready' && issues.data.issues.length === 0 && <div className="inspector-status">No open issues.</div>}
            {(issues.data?.issues || []).map((issue) => (
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
                <button key={pull.number} className={selectedNumber === pull.number ? 'selected' : ''} disabled={acting} onClick={() => setSelectedNumber(pull.number)}>
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

            <main className="github-pr-detail" data-state={detail.status}>
              {detail.status === 'failed' ? (
                <div className="inspector-status inspector-error" role="alert">
                  <strong>This pull request could not be loaded</strong>
                  <span>{detail.error}</span>
                  <button className="primary-btn" onClick={() => detail.reload()}>Try again</button>
                </div>
              ) : !pullDetail ? (
                selectedNumber != null ? (
                  <div className="inspector-status" role="status"><span className="spinner" /> Loading pull request…</div>
                ) : (
                  <div className="inspector-status">Select a pull request to inspect it.</div>
                )
              ) : (
                <>
                  <div className="github-detail-head">
                    <div>
                      <span className="github-pr-number">Pull request #{pullDetail.number}</span>
                      <h3>{pullDetail.title}</h3>
                      <div className="github-detail-author"><GitHubAvatar user={pullDetail.author} size={22} /> {pullDetail.author.login}</div>
                    </div>
                    <button className="ghost-btn" onClick={() => openExternal(pullDetail.htmlUrl)} disabled={openingUrl === pullDetail.htmlUrl}>
                      {openingUrl === pullDetail.htmlUrl ? <><span className="spinner" /> Opening…</> : 'Open on GitHub'}
                    </button>
                  </div>

                  <div className="github-pr-facts">
                    <span><strong>{pullDetail.commits}</strong> commits</span>
                    <span><strong>{pullDetail.changedFiles}</strong> files</span>
                    <span className="add">+{pullDetail.additions}</span>
                    <span className="del">−{pullDetail.deletions}</span>
                    <span className={`github-ci github-ci-${pullDetail.ci.state}`}>{pullDetail.ci.state === 'success' ? 'Checks passed' : pullDetail.ci.state === 'failure' ? `${pullDetail.ci.failed} checks failed` : pullDetail.ci.state === 'pending' ? 'Checks running' : 'No checks reported'}</span>
                  </div>
                  <div className="github-branches"><code>{pullDetail.base.ref}</code><span>←</span><code>{pullDetail.head.ref}</code><small>{shortHash(pullDetail.head.sha)}</small></div>
                  {pullDetail.body && <div className="github-pr-body">{pullDetail.body}</div>}

                  <section className="github-reviews">
                    <h4>Reviews</h4>
                    {pullDetail.reviews.length === 0 && <p>No reviews submitted yet.</p>}
                    {pullDetail.reviews.map((review) => (
                      <div key={review.id} className="github-review">
                        <GitHubAvatar user={review.author} size={22} />
                        <span><strong>{review.author.login}</strong><small>{review.state.replace(/_/g, ' ').toLowerCase()}</small>{review.body && <p>{review.body}</p>}</span>
                      </div>
                    ))}
                  </section>

                  <section className="github-review-form">
                    <h4>Submit a review</h4>
                    <textarea name="github-review-body" value={reviewBody} disabled={reviewBusy} onChange={(event) => setReviewBody(event.target.value)} placeholder="Write your review…" rows={3} />
                    <div>
                      <select name="github-review-event" value={reviewEvent} disabled={reviewBusy} onChange={(event) => setReviewEvent(event.target.value)}>
                        <option value="COMMENT">Comment</option>
                        <option value="APPROVE">Approve</option>
                        <option value="REQUEST_CHANGES">Request changes</option>
                      </select>
                      <button className="primary-btn" onClick={submitReview} disabled={acting || (reviewEvent !== 'APPROVE' && !reviewBody.trim()) || !pullDetail.authenticated}>
                        {reviewBusy ? <><span className="spinner" /> Submitting…</> : 'Submit review'}
                      </button>
                    </div>
                  </section>

                  <section className="github-merge-zone">
                    {!mergeOpen ? (
                      <button className="primary-btn" onClick={() => setMergeOpen(true)} disabled={acting || !pullDetail.authenticated || pullDetail.draft || pullDetail.mergeable === false || pullDetail.ci.state === 'failure'}>Review merge options</button>
                    ) : (
                      <div className="github-merge-confirm">
                        <strong>Merge pull request #{pullDetail.number}?</strong>
                        <p>GitVista merges only while the head commit is still <code>{shortHash(pullDetail.head.sha)}</code>. If someone pushes a new commit after your review, the merge is refused.</p>
                        <select name="github-merge-method" value={mergeMethod} disabled={mergeBusy} onChange={(event) => setMergeMethod(event.target.value)}>
                          <option value="squash">Squash and merge</option>
                          <option value="merge">Create a merge commit</option>
                          <option value="rebase">Rebase and merge</option>
                        </select>
                        <div><button className="ghost-btn" onClick={() => setMergeOpen(false)} disabled={mergeBusy}>Cancel</button><button className="primary-btn" onClick={mergePull} disabled={acting}>{mergeBusy ? <><span className="spinner" /> Merging…</> : 'Merge on GitHub'}</button></div>
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
