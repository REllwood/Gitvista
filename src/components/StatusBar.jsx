import Icon from './Icon'
import { changedFileCount } from '../lib/repositorySession'

export default function StatusBar({ repo, busy, activities, onActivity }) {
  const running = activities.find((item) => item.state === 'running')
  const status = repo.status
  const count = changedFileCount(status)
  const sync = !repo.remotes.length ? 'Local repository' : !status.tracking ? 'No upstream branch' :
    status.ahead || status.behind ? `${status.ahead} ahead · ${status.behind} behind` : 'Up to date with upstream'
  return (
    <footer className="statusbar">
      <span className="statusbar-state" role="status">
        {busy || running ? <><span className="spinner" />{running?.label || 'Refreshing repository'}…</> :
          <><Icon name={repo.conflict?.conflictedFiles?.length ? 'alert' : count ? 'commit' : 'check'} size={13} />
            {repo.conflict?.conflictedFiles?.length ? `${repo.conflict.conflictedFiles.length} conflicts` : count ? `${count} changed file${count === 1 ? '' : 's'} · ${status.staged.length} staged` : 'Working tree clean'}</>}
      </span>
      <span className="statusbar-sync" title={status.tracking || ''}>{sync}</span>
      <button onClick={onActivity}><Icon name="history" size={13} />Activity{activities[0]?.state === 'failed' && <span className="activity-alert" aria-label="Last operation failed" />}</button>
    </footer>
  )
}
