import Icon from './Icon'

// Strip of open repositories. Click to switch, × to close, + to open another.
export default function TabBar({ tabs, activePath, onSwitch, onClose, onNew, busy = false }) {
  return (
    <nav className="tabbar" aria-label="Open repositories">
      {tabs.map((t) => (
        <div
          key={t.path}
          className={'tab' + (t.path === activePath ? ' active' : '')}
          title={t.path}
        >
          <button
            className="tab-select"
            aria-current={t.path === activePath ? 'page' : undefined}
            onClick={() => onSwitch(t.path)}
            disabled={busy}
          >
            <span className="tab-dot" />
            <span className="tab-name">{t.name}</span>
          </button>
          <button
            className="tab-close"
            aria-label={`Close ${t.name}`}
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation()
              onClose(t.path)
            }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew} disabled={busy} title="Open another repository">
        <Icon name="plus" size={14} />
      </button>
    </nav>
  )
}
