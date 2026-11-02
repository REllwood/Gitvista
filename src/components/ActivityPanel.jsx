import ModalOverlay from './ModalOverlay'
import Icon from './Icon'

function durationLabel(milliseconds) {
  if (!Number.isFinite(milliseconds)) return ''
  if (milliseconds < 1000) return `${milliseconds} ms`
  if (milliseconds < 60_000) return `${(milliseconds / 1000).toFixed(milliseconds < 10_000 ? 1 : 0)} s`
  const minutes = Math.floor(milliseconds / 60_000)
  const seconds = Math.round((milliseconds % 60_000) / 1000)
  return `${minutes} min ${seconds} s`
}

export default function ActivityPanel({ activities, onClose, onClear }) {
  return (
    <ModalOverlay className="modal-overlay" onClick={onClose}>
      <section
        className="activity-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="activity-head">
          <div>
            <h2 id="activity-title">Git activity</h2>
            <p>Recent operations from this GitVista session.</p>
          </div>
          <button className="activity-close" onClick={onClose} aria-label="Close activity panel">
            <Icon name="x" />
          </button>
        </header>

        <div className="activity-list" aria-live="polite">
          {activities.length === 0 && <div className="activity-empty">No Git operations yet.</div>}
          {activities.map((activity) => (
            <div key={activity.id} className={`activity-row activity-${activity.state}`}>
              <span className="activity-state" aria-hidden="true">
                {activity.state === 'running' ? (
                  <span className="spinner" />
                ) : (
                  <Icon name={activity.state === 'failed' ? 'x' : 'check'} />
                )}
              </span>
              <span className="activity-main">
                <strong>{activity.label}</strong>
                {activity.error && <span className="activity-error">{activity.error}</span>}
              </span>
              <span className="activity-meta">
                {activity.state === 'running' ? 'In progress' : durationLabel(activity.durationMs)}
              </span>
            </div>
          ))}
        </div>

        <footer className="activity-footer">
          <button className="ghost-btn" onClick={onClear} disabled={activities.some((item) => item.state === 'running')}>
            Clear completed
          </button>
          <button className="primary-btn" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </ModalOverlay>
  )
}
