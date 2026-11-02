import { useState } from 'react'
import ContextMenu from './ContextMenu'
import Term from './Term'
import Icon from './Icon'

function Section({ title, termId, count, action, children }) {
  const [open, setOpen] = useState(true)
  return (
    <div className="side-section">
      <div className="side-head">
        <button className="side-collapse" onClick={() => setOpen((value) => !value)} aria-expanded={open} aria-label={`${open ? 'Collapse' : 'Expand'} ${title}`}>{open ? '⌄' : '›'}</button>
        <span className="side-head-title">
          {termId ? <Term id={termId}>{title}</Term> : title}
          {count != null && <span className="side-count">{count}</span>}
        </span>
        {action}
      </div>
      {open && <div className="side-items">{children}</div>}
    </div>
  )
}

export default function Sidebar({
  repo,
  busy = false,
  onCheckout,
  onMerge,
  onRebase,
  onDeleteBranch,
  onRenameBranch,
  onSetUpstream,
  onCheckoutRemote,
  onDeleteTag,
  onPushTag,
  onDeleteRemoteTag,
  onDeleteRemoteBranch,
  onStashPop,
  onStashApply,
  onStashDrop,
  onAddRemote,
  onRemoveRemote,
  onRenameRemote,
  onAddWorktree,
  onOpenWorktree,
}) {
  const [branchMenu, setBranchMenu] = useState(null)
  const cur = repo.currentBranch
  const activate = (event, callback) => {
    if (busy || !['Enter', ' '].includes(event.key)) return
    event.preventDefault()
    callback()
  }
  return (
    <aside
      className="sidebar"
      aria-busy={busy}
      onClickCapture={(event) => {
        if (busy) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {branchMenu && <ContextMenu {...branchMenu} onClose={() => setBranchMenu(null)} />}
      <Section title="Branches" termId="branch" count={repo.localBranches.length}>
        {repo.localBranches.map((b) => (
          <div key={b.name} className={'side-item branch' + (b.current ? ' current' : '')}>
            <span className="si-dot" />
            <span
              className="si-name"
              onClick={() => !b.current && onCheckout(b.name)}
              onKeyDown={(event) => !b.current && activate(event, () => onCheckout(b.name))}
              role={!b.current ? 'button' : undefined}
              tabIndex={!b.current ? 0 : undefined}
              aria-disabled={!b.current && busy ? true : undefined}
              title={b.current ? 'This is your current branch (HEAD)' : 'Click to switch to this branch'}
            >
              <span className="branch-label">{b.name}</span>
              {b.current && <span className="si-tag">HEAD</span>}
            </span>
            <button className="branch-menu-button" aria-label={`Actions for ${b.name}`} title={`Actions for ${b.name}`} disabled={busy} onClick={(event) => {
              const rect = event.currentTarget.getBoundingClientRect()
              setBranchMenu({ x: rect.left, y: rect.bottom + 4, items: [
                ...(!b.current ? [
                  { label: 'Switch to branch', icon: 'switch', onClick: () => onCheckout(b.name) },
                  ...(cur ? [
                    { label: `Merge into ${cur}`, icon: 'merge', onClick: () => onMerge(b.name) },
                    { label: `Rebase ${cur} onto this`, icon: 'rebase', onClick: () => onRebase(b.name) },
                  ] : []),
                  { divider: true },
                ] : []),
                { label: 'Rename branch', icon: 'pencil', onClick: () => onRenameBranch(b.name) },
                { label: 'Set upstream', icon: 'pr', onClick: () => onSetUpstream(b) },
                ...(!b.current ? [{ divider: true }, { label: 'Delete branch', icon: 'trash', danger: true, onClick: () => onDeleteBranch(b.name) }] : []),
              ] })
            }}>···</button>
          </div>
        ))}
      </Section>

      <Section
        title="Worktrees"
        count={repo.worktrees?.length || 0}
        action={
          <button className="side-add" title="Add a worktree" onClick={onAddWorktree}>
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {(repo.worktrees || []).map((worktree) => (
          <div key={worktree.path} className={'side-item worktree' + (worktree.current ? ' current' : '')}>
            <span className="si-dot worktree-dot" />
            <span
              className="si-name"
              title={worktree.path}
              onClick={() => !worktree.current && onOpenWorktree(worktree.path)}
              onKeyDown={(event) => !worktree.current && activate(event, () => onOpenWorktree(worktree.path))}
              role={!worktree.current ? 'button' : undefined}
              tabIndex={!worktree.current ? 0 : undefined}
              aria-disabled={!worktree.current && busy ? true : undefined}
            >
              <span className="worktree-name">{worktree.path.replace(/[/\\]+$/, '').split(/[/\\]/).pop()}</span>
              <span className="si-url">{worktree.branch || 'detached HEAD'}</span>
            </span>
            {!worktree.current && (
              <span className="si-actions">
                <button title="Open this worktree" onClick={() => onOpenWorktree(worktree.path)}>Open</button>
              </span>
            )}
          </div>
        ))}
      </Section>

      <Section
        title="Remotes"
        termId="remote"
        count={repo.remotes.length}
        action={
          <button className="side-add" title="Add a remote" onClick={onAddRemote}>
            <Icon name="plus" size={13} />
          </button>
        }
      >
        {repo.remotes.length === 0 && <div className="side-empty">No remote yet — add one to push your work.</div>}
        {repo.remotes.map((r) => (
          <div key={r.name} className="side-item remote">
            <span className="si-dot remote-dot" />
            <span className="si-name" title={r.url}>
              {r.name}
              <span className="si-url">{r.url}</span>
            </span>
            <span className="si-actions">
              <button title="Rename this remote" onClick={() => onRenameRemote(r.name)}>
                <Icon name="pencil" size={13} />
              </button>
              <button className="si-del" title="Remove this remote" onClick={() => onRemoveRemote(r.name)}>
                <Icon name="trash" size={13} />
              </button>
            </span>
          </div>
        ))}
      </Section>

      {repo.remoteBranches.length > 0 && (
        <Section title="Remote branches" termId="remote" count={repo.remoteBranches.length}>
          {repo.remoteBranches.map((b) => (
            <div key={b.name} className="side-item remote">
              <span className="si-dot remote-dot" />
              <span
                className="si-name"
                title="Click to create a local branch that follows this one"
                onClick={() => onCheckoutRemote(b.name)}
                onKeyDown={(event) => activate(event, () => onCheckoutRemote(b.name))}
                role="button"
                tabIndex="0"
                aria-disabled={busy || undefined}
              >
                {b.name}
              </span>
              <span className="si-actions">
                <button title="Check out as a local tracking branch" onClick={() => onCheckoutRemote(b.name)}>
                  <Icon name="switch" size={13} />
                </button>
                <button className="si-del" title="Delete this branch from the remote" onClick={() => onDeleteRemoteBranch(b.name)}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </Section>
      )}

      {repo.tags.length > 0 && (
        <Section title="Tags" termId="tag" count={repo.tags.length}>
          {repo.tags.map((t) => (
            <div key={t} className="side-item">
              <span className="si-dot tag-dot" />
              <span className="si-name">{t}</span>
              <span className="si-actions">
                <button title="Push this tag to the default remote" onClick={() => onPushTag(t)}>
                  <Icon name="push" size={13} />
                </button>
                <button className="si-del" title="Delete this tag from the default remote" onClick={() => onDeleteRemoteTag(t)}>
                  <Icon name="pr" size={13} />
                </button>
                <button className="si-del" title="Delete this tag" onClick={() => onDeleteTag(t)}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </Section>
      )}

      {repo.stashes.length > 0 && (
        <Section title="Stashes" termId="stash" count={repo.stashes.length}>
          {repo.stashes.map((s) => (
            <div key={s.index} className="side-item">
              <span className="si-dot stash-dot" />
              <span className="si-name" title={s.message}>
                {s.message || `stash@{${s.index}}`}
              </span>
              <span className="si-actions">
                <button title="Bring these changes back and remove the stash" onClick={() => onStashPop(s.index)}>
                  Unstash
                </button>
                <button title="Apply but keep the stash in the list" onClick={() => onStashApply(s.index)}>
                  Apply
                </button>
                <button className="si-del" title="Delete this stash" onClick={() => onStashDrop(s.index)}>
                  <Icon name="trash" size={13} />
                </button>
              </span>
            </div>
          ))}
        </Section>
      )}
    </aside>
  )
}
