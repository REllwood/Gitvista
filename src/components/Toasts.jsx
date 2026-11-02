import Icon from './Icon'

const ICON = { error: 'alert', success: 'check', info: 'info' }

export default function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`} role={t.kind === 'error' ? 'alert' : 'status'} onClick={() => onDismiss(t.id)}>
          <Icon name={ICON[t.kind] || 'info'} />
          <span className="toast-text">{t.text}</span>
          <button className="toast-close" aria-label="Dismiss">
            <Icon name="x" size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
