import Icon from './Icon'

const basename = (path) => path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() || path

export default function WelcomeScreen({ onOpen, onClone, onSandbox, hasApi, recentRepos = [], openingRecent, onOpenRecent, onForgetRecent, busy = false }) {
  return (
    <main className="welcome">
      <div className="welcome-card">
        <section className="welcome-intro">
          <span className="welcome-eyebrow"><span className="brand-mark"><Icon name="branch" size={20} /></span>Open source. At your command.</span>
          <h1>Your history.<br /><span>A clearer view.</span></h1>
          <p className="welcome-sub">Understand your branches, review every change, and see what happens before you act.</p>
          {!hasApi && <p className="welcome-warn"><Icon name="alert" />Open the GitVista desktop app to work with local repositories.</p>}
          <div className="welcome-actions">
            <button className="primary-btn big" onClick={onOpen} disabled={!hasApi || busy}><Icon name="folder" />Open repository</button>
            <button className="ghost-btn big" onClick={onClone} disabled={!hasApi || busy}><Icon name="clone" />Clone repository</button>
          </div>
          <button className="sandbox-card" onClick={onSandbox} disabled={!hasApi || busy}>
            <Icon name="beaker" size={20} />
            <span><strong>Get a feel for GitVista</strong><small>Explore branches and commits in a practice repository.</small></span>
            {busy ? <span className="spinner" aria-label="Opening repository" /> : <span aria-hidden="true">→</span>}
          </button>
        </section>
        <section className="recent-repositories" aria-labelledby="recent-repositories-title">
          <div className="recent-repositories-head"><h2 id="recent-repositories-title">Pick up where you left off</h2><span>{recentRepos.length ? 'Recent repositories' : 'Your workspace starts here'}</span></div>
          {recentRepos.length ? (
            <div className="recent-repositories-list">
              {recentRepos.slice(0, 6).map((path) => (
                <div className="recent-repository" key={path}>
                  <button className="recent-repository-open" onClick={() => onOpenRecent(path)} disabled={!hasApi || busy || !!openingRecent} title={path}>
                    <span className="recent-repository-icon"><Icon name="folder" size={17} /></span>
                    <span className="recent-repository-copy"><strong>{basename(path)}</strong><small>{path}</small></span>
                    {openingRecent === path && <span className="spinner" role="status" aria-label={`Opening ${basename(path)}`} />}
                  </button>
                  <button className="recent-repository-forget" onClick={() => onForgetRecent(path)} disabled={busy || !!openingRecent} aria-label={`Forget ${basename(path)} from recent repositories`} title="Forget from recents"><Icon name="x" size={12} /></button>
                </div>
              ))}
            </div>
          ) : (
            <div className="welcome-steps">
              <div><span>01</span><p><strong>Bring your project</strong>Open a folder or clone from your Git host.</p></div>
              <div><span>02</span><p><strong>See the whole story</strong>Follow branches, people and changes in one place.</p></div>
              <div><span>03</span><p><strong>Make your next move</strong>Review, stage and commit with a preview.</p></div>
            </div>
          )}
        </section>
        <div className="welcome-foot"><span>Local repositories. Your system Git. Your workflow.</span><span>Command palette <kbd>{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}K</kbd></span></div>
      </div>
    </main>
  )
}
