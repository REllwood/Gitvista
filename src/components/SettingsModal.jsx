import ModalOverlay from './ModalOverlay'
import { useEffect, useState } from 'react'
import useMachine from '../hooks/useMachine'
import useResource from '../hooks/useResource'
import { operationMachine } from '../lib/machines'
import Icon from './Icon'
import Term from './Term'

// Global Git preferences: identity (needed to commit), default pull behavior,
// and a place to save a GitHub token so HTTPS push/pull stops failing.
export default function SettingsModal({ theme, onTheme, repoPath, onClose, onSaved, toast }) {
  const [scope, setScope] = useState('global')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [pullMode, setPullMode] = useState('false')
  const [signMode, setSignMode] = useState('false')
  const [signingFormat, setSigningFormat] = useState('openpgp')
  const [signingKey, setSigningKey] = useState('')
  const [version, setVersion] = useState('')
  const [ghUser, setGhUser] = useState('')
  const [ghToken, setGhToken] = useState('')
  // One save at a time: the profile writes, the keychain write and opening the
  // token page all go through the main process's single operation gate.
  const [task, sendTask] = useMachine(operationMachine)
  const modalBusy = task.value === 'running'
  const savingId = task.context.kind === 'profile'
  const savingTok = task.context.kind === 'token'
  const openingToken = task.context.kind === 'token-page'

  useEffect(() => {
    let alive = true
    window.api.gitVersion()
      .then((result) => {
        if (alive && result?.ok) setVersion(String(result.data || ''))
      })
      .catch(() => {
        if (alive) setVersion('Git version unavailable')
      })
    return () => {
      alive = false
    }
  }, [])

  // The profile for the chosen scope. Its fields can only be edited, and saved,
  // once it has loaded, so a failed load can never save blank values over the
  // real ones. Escape is answered by ModalOverlay, which refuses while busy.
  const profile = useResource(async () => {
    const result = await window.api.getConfig(scope, scope === 'local' ? repoPath : null)
    if (!result?.ok) throw new Error(result?.error || 'Git settings could not be loaded.')
    return result.data || {}
  }, [scope, repoPath])
  const profileEditable = profile.status === 'ready' && !modalBusy

  useEffect(() => {
    if (profile.status !== 'ready') return
    const c = profile.data
    setName(String(c.name || ''))
    setEmail(String(c.email || ''))
    setPullMode(c.pullRebase == null ? 'inherit' : c.pullRebase === true ? 'true' : 'false')
    setSignMode(c.signCommits == null ? 'inherit' : c.signCommits === true ? 'true' : 'false')
    setSigningFormat(String(c.signingFormat ?? (scope === 'local' ? '' : 'openpgp')))
    setSigningKey(String(c.signingKey || ''))
    // The fields follow each newly loaded profile, not every scope change.
  }, [profile.status, profile.data]) // eslint-disable-line react-hooks/exhaustive-deps

  async function saveIdentity() {
    if (!profileEditable || !sendTask({ type: 'START', kind: 'profile' })) return
    try {
      const targetPath = scope === 'local' ? repoPath : null
      const settings = [
        ['user.name', name.trim()],
        ['user.email', email.trim()],
        ['pull.rebase', scope === 'local' && pullMode === 'inherit' ? '' : pullMode],
        ['commit.gpgsign', scope === 'local' && signMode === 'inherit' ? '' : signMode],
        ['gpg.format', signingFormat],
        ['user.signingkey', signingKey.trim()],
      ]
      // Git locks its config file for each write. Keep these sequential so two
      // writes never race for the same lock on slower disks or network homes.
      for (const [key, value] of settings) {
        const result = await window.api.setConfig(scope, key, value, targetPath)
        if (!result?.ok) throw new Error(result?.error || 'Could not save settings.')
      }
      toast('success', scope === 'local' ? 'Saved this repository’s Git profile.' : 'Saved your global Git profile.')
      onSaved?.()
    } catch (error) {
      toast('error', error?.message || 'Could not save settings.')
    } finally {
      sendTask({ type: 'FINISH' })
      profile.reload()
    }
  }

  async function saveToken() {
    if (!ghUser.trim() || !ghToken.trim()) {
      toast('error', 'Enter your GitHub username and a personal access token.')
      return
    }
    if (!sendTask({ type: 'START', kind: 'token' })) return
    try {
      const r = await window.api.storeCredential({ host: 'github.com', username: ghUser.trim(), token: ghToken.trim() })
      if (!r?.ok) throw new Error(r?.error || 'Could not save the token.')
      toast('success', 'GitHub token saved to your system keychain.')
      setGhToken('')
    } catch (error) {
      toast('error', error?.message || 'Could not save the token.')
    } finally {
      sendTask({ type: 'FINISH' })
    }
  }

  async function openTokenPage() {
    if (!sendTask({ type: 'START', kind: 'token-page' })) return
    try {
      const result = await window.api.openExternal('https://github.com/settings/personal-access-tokens/new')
      if (!result?.ok) throw new Error(result?.error || 'The GitHub token page could not be opened.')
    } catch (error) {
      toast('error', error?.message || 'The GitHub token page could not be opened.')
    } finally {
      sendTask({ type: 'FINISH' })
    }
  }

  return (
    <ModalOverlay className="modal-overlay" onClick={() => !modalBusy && onClose()}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title" id="settings-title">Settings</div>
        {profile.status === 'loading' && <div className="settings-loading" role="status"><span className="spinner" /> Loading settings…</div>}

        <div className="settings-section">
          <div className="settings-head">Appearance</div>
          <p className="settings-hint">Follow your system appearance or keep GitVista consistently light or dark.</p>
          <label className="modal-field">
            <span>Theme</span>
            <select className="modal-input" name="theme" value={theme} onChange={(event) => onTheme(event.target.value)}>
              <option value="system">Use system setting</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-head">Git profile and signing</div>
          <p className="settings-hint">
            Every <Term id="commit">commit</Term> records who made it. Keep a global profile, or override it for the current repository when work and personal identities differ.
          </p>
          <label className="modal-field">
            <span>Apply profile to</span>
            <select
              className="modal-input"
              name="git-profile-scope"
              value={scope}
              onChange={(event) => setScope(event.target.value)}
              disabled={modalBusy || profile.status === 'loading'}
            >
              <option value="global">All repositories (global)</option>
              <option value="local" disabled={!repoPath}>This repository only</option>
            </select>
            {scope === 'local' && (
              <span className="modal-slug">
                Blank identity fields inherit global values. Pull and signing can inherit globally or be overridden here.
              </span>
            )}
          </label>
          {profile.status === 'failed' && (
            <div className="settings-load-error" role="alert">
              <span>{profile.error}</span>
              <button className="link-btn" onClick={() => profile.reload()}>Try again</button>
            </div>
          )}
          <fieldset className="settings-fields" disabled={!profileEditable} data-state={profile.status}>
          <label className="modal-field">
            <span>Name</span>
            <input className="modal-input" name="git-author-name" autoComplete="name" value={name} placeholder="Ada Lovelace" onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>Email</span>
            <input className="modal-input" name="git-author-email" type="email" autoComplete="email" value={email} placeholder="ada@example.com" onChange={(e) => setEmail(e.target.value)} />
          </label>
          {scope === 'local' ? (
            <>
              <label className="modal-field">
                <span>Pull strategy</span>
                <select className="modal-input" name="pull-rebase" value={pullMode} onChange={(event) => setPullMode(event.target.value)}>
                  <option value="inherit">Use global setting</option>
                  <option value="true">Rebase when pulling</option>
                  <option value="false">Merge when pulling</option>
                </select>
              </label>
              <label className="modal-field">
                <span>Commit signing</span>
                <select className="modal-input" name="sign-commits" value={signMode} onChange={(event) => setSignMode(event.target.value)}>
                  <option value="inherit">Use global setting</option>
                  <option value="true">Sign commits</option>
                  <option value="false">Do not sign commits</option>
                </select>
              </label>
            </>
          ) : (
            <>
              <label className="settings-check">
                <input type="checkbox" name="pull-rebase" checked={pullMode === 'true'} onChange={(event) => setPullMode(event.target.checked ? 'true' : 'false')} />
                <span>
                  When pulling, <Term id="pull">rebase</Term> instead of merge (keeps history a straight line)
                </span>
              </label>
              <label className="settings-check">
                <input type="checkbox" name="sign-commits" checked={signMode === 'true'} onChange={(event) => setSignMode(event.target.checked ? 'true' : 'false')} />
                <span>Cryptographically sign new commits from this profile</span>
              </label>
            </>
          )}
          {signMode !== 'false' && (
            <div className="settings-signing">
              <label className="modal-field">
                <span>Signing format</span>
                <select className="modal-input" name="signing-format" value={signingFormat} onChange={(event) => setSigningFormat(event.target.value)}>
                  {scope === 'local' && <option value="">Use global format</option>}
                  <option value="openpgp">OpenPGP / GPG</option>
                  <option value="ssh">SSH</option>
                  <option value="x509">X.509</option>
                </select>
              </label>
              <label className="modal-field">
                <span>Signing key <small>(optional for a configured GPG default)</small></span>
                <input
                  className="modal-input"
                  name="signing-key"
                  value={signingKey}
                  placeholder={signingFormat === 'ssh' ? '~/.ssh/id_ed25519.pub' : scope === 'local' ? 'Use global signing key' : 'Key ID or fingerprint'}
                  onChange={(event) => setSigningKey(event.target.value)}
                />
              </label>
            </div>
          )}
          </fieldset>
          <div className="settings-actions">
            <button className="primary-btn" onClick={saveIdentity} disabled={!profileEditable}>
              {savingId ? <><span className="spinner" aria-hidden="true" /> Saving…</> : 'Save Git profile'}
            </button>
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-head">GitHub access</div>
          <p className="settings-hint">
            To push and pull over HTTPS, and use the in-app pull request dashboard, save a fine-grained personal access
            token. It stays in your operating system's secure keychain and is never exposed to the app interface.
          </p>
          <label className="modal-field">
            <span>GitHub username</span>
            <input className="modal-input" name="github-username" autoComplete="username" disabled={modalBusy} value={ghUser} placeholder="your-username" onChange={(e) => setGhUser(e.target.value)} />
          </label>
          <label className="modal-field">
            <span>Personal access token</span>
            <input
              className="modal-input"
              name="github-token"
              disabled={modalBusy}
              type="password"
              autoComplete="off"
              value={ghToken}
              placeholder="ghp_…"
              onChange={(e) => setGhToken(e.target.value)}
            />
          </label>
          <div className="settings-actions">
            <button
              className="ghost-btn"
              onClick={openTokenPage}
              disabled={modalBusy}
            >
              {openingToken ? <><span className="spinner" aria-hidden="true" /> Opening…</> : 'Get a token'}
            </button>
            <button className="primary-btn" onClick={saveToken} disabled={modalBusy}>
              {savingTok ? <><span className="spinner" aria-hidden="true" /> Saving…</> : 'Save token'}
            </button>
          </div>
        </div>

        <div className="settings-footer">
          <span className="settings-version">{version}</span>
          <button className="ghost-btn" onClick={onClose} disabled={modalBusy}>
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}
