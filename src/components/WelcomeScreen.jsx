import Icon from './Icon'

const basename = (path) => path.replace(/[/\\]+$/, '').split(/[/\\]/).filter(Boolean).pop() || path

export default function WelcomeScreen({ onOpen, onClone, onSandbox, hasApi, recentRepos = [], openingRecent, onOpenRecent, onForgetRecent, busy = false }) {
  return (
    <main className="welcome">
      <div className="welcome-card">
        <section className="welcome-intro">
          <span className="welcome-eyebrow"><span className="brand-mark"><Icon name="branch" size={20} /></span>Open-source visual Git client</span>
          <h1>See what Git will do<br /><span>before you run it.</span></h1>
          <p className="welcome-sub">GitVista previews each action on your commit history, explains it in plain English and shows the git command it will run.</p>
          {!hasApi && <p className="welcome-warn"><Icon name="alert" />Open the GitVista desktop app to work with local repositories.</p>}
          <div className="welcome-actions">
            <button className="primary-btn big" onClick={onOpen} disabled={!hasApi || busy}><Icon name="folder" />Open repository</button>
            <button className="ghost-btn big" onClick={onClone} disabled={!hasApi || busy}><Icon name="clone" />Clone repository</button>
          </div>
          <button className="sandbox-card" onClick={onSandbox} disabled={!hasApi || busy}>
            <Icon name="beaker" size={20} />
            <span><strong>Open the practice repository</strong><small>A separate demo project with branches and commits to experiment on.</small></span>
            {busy ? <span className="spinner" aria-label="Opening repository" /> : <span aria-hidden="true">→</span>}
          </button>
        </section>
        <section className="recent-repositories" aria-labelledby="recent-repositories-title">
          <div className="recent-repositories-head"><h2 id="recent-repositories-title">{recentRepos.length ? 'Recent repositories' : 'Getting started'}</h2><span>{recentRepos.length ? 'Reopen a project' : 'From folder to first commit'}</span></div>
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
              <div><span>01</span><p><strong>Open or clone a repository</strong>Choose a local folder, or paste a URL from GitHub or another Git host.</p></div>
              <div><span>02</span><p><strong>Read the history</strong>The graph shows every branch, who made each commit and what changed.</p></div>
              <div><span>03</span><p><strong>Preview, then commit</strong>Stage your changes and see the new commit on the graph first.</p></div>
            </div>
          )}
        </section>
        <div className="welcome-foot"><span>Works on local repositories with the Git already installed on your computer.</span><span>Command palette <kbd>{/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}K</kbd></span></div>
      </div>
    </main>
  )
}
