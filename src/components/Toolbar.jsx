import Icon from './Icon'

function ToolButton({ icon, label, onClick, disabled, title, badge, primary = false }) {
  return (
    <button className={`tb-btn${primary ? ' tb-primary' : ''}${label ? '' : ' tb-icon-only'}`} onClick={onClick} disabled={disabled} title={title} aria-label={label || title}>
      <Icon name={icon} size={15} />
      {label && <span className="tb-label">{label}</span>}
      {badge > 0 && <span className="tb-badge">{badge}</span>}
    </button>
  )
}

export default function Toolbar({ repo, prAvailable, onOpen, onClone, onRefresh, onFetch, onPull, onPush,
  onBranch, onStash, onUndo, onHistory, onCreatePR, onSettings, onHelp, onCommands,
  onInstallUpdate, updateStatus, busy, tabBar = null }) {
  const status = repo?.status || {}
  const hasRemote = !!repo?.remotes?.length
  const paused = !!repo?.conflict?.inProgress
  const mod = /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'
  return (
    <>
      <header className="toolbar">
        <div className="tb-logo"><span className="brand-mark"><Icon name="branch" size={16} /></span>GitVista</div>
        {tabBar}
        <button className={'command-launcher' + (tabBar ? ' compact' : '')} onClick={onCommands} disabled={busy}>
          <Icon name="search" size={13} /><span>Find a command or branch</span><kbd>{mod}K</kbd>
        </button>
        <div className="tb-right">
          {!repo && busy && <span className="tb-operation" role="status"><span className="spinner" />Opening…</span>}
          {updateStatus?.state === 'ready' && <button className="tb-update-ready" disabled={busy} onClick={onInstallUpdate}>Update ready</button>}
          {updateStatus?.state === 'downloading' && <span role="status"><span className="spinner" />{updateStatus.percent || 0}%</span>}
          <ToolButton icon="folder" label="Open" onClick={onOpen} disabled={busy} title="Open a local repository" />
          <ToolButton icon="clone" label="Clone" onClick={onClone} disabled={busy} title="Clone a repository" />
          <span className="tb-divider" />
          <ToolButton icon="gear" onClick={onSettings} disabled={busy} title="Settings" />
          <ToolButton icon="help" onClick={onHelp} title="Git glossary and help" />
        </div>
      </header>
      {repo && (
        <div className="repository-toolbar" aria-label="Repository actions">
          <div className="repository-heading">
            <Icon name="folder" size={17} /><strong title={repo.path}>{repo.name}</strong><span className="repository-slash">/</span>
            <button className={`branch-switcher${repo.detached ? ' detached' : ''}`} onClick={onCommands} disabled={busy} title="Find and switch branches">
              <Icon name="branch" size={14} /><span>{repo.currentBranch || 'Detached HEAD'}</span><span aria-hidden="true">⌄</span>
            </button>
          </div>
          <div className="repository-tools">
            <ToolButton icon="fetch" label="Fetch" onClick={onFetch} disabled={busy || !hasRemote} title={hasRemote ? 'Check remotes for new commits' : 'Add a remote in the sidebar to fetch'} />
            <ToolButton icon="pull" label="Pull" onClick={onPull} disabled={busy || !hasRemote || !status.tracking || paused} badge={status.behind} title={status.tracking ? 'Bring remote changes into this branch' : 'Set an upstream branch before pulling'} />
            <ToolButton icon="push" label="Push" onClick={onPush} disabled={busy || !hasRemote || repo.detached || paused} badge={status.ahead} title="Push this branch to its remote" primary />
            <span className="tb-divider" />
            <ToolButton icon="branch" label="Branch" onClick={onBranch} disabled={busy || paused} title="Create a branch with a history preview" />
            <ToolButton icon="stash" label="Stash" onClick={onStash} disabled={busy || status.clean || paused} title="Set aside working changes" />
            <ToolButton icon="undo" onClick={onUndo} disabled={busy || paused} title="Preview undo of the last Git action" />
            <ToolButton icon="history" onClick={onHistory} disabled={busy} title="Reflog and recovery" />
            <ToolButton icon="pr" onClick={onCreatePR} disabled={busy || !prAvailable} title="GitHub pull requests and issues" />
            <ToolButton icon="refresh" onClick={onRefresh} disabled={busy} title="Refresh repository" />
          </div>
        </div>
      )}
    </>
  )
}
