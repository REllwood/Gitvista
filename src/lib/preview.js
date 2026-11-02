// Simulates the result of a git action on the *graph data only* — no git is
// run. Each function returns { commits, note }: a cloned commit list with
// synthetic "ghost" nodes/refs flagged, plus a plain-language explanation.
// The UI renders this side-by-side with the real graph so a beginner can see
// what an action will do before committing to it.

let ghostCounter = 0
const ghostHash = () => `ghost-${++ghostCounter}`

function clone(commits) {
  return commits.map((c) => ({
    ...c,
    parents: [...c.parents],
    refs: (c.refs || []).map((r) => ({ ...r })),
  }))
}

// Where HEAD currently is, and the branch it points to.
function findHead(repo) {
  for (const c of repo.commits) {
    for (const r of c.refs || []) {
      if (r.type === 'head') return { hash: c.hash, branch: r.name }
    }
  }
  return { hash: repo.head || null, branch: repo.currentBranch || null }
}

function tipOf(repo, name) {
  for (const c of repo.commits) {
    for (const r of c.refs || []) {
      if (r.name === name && (r.type === 'branch' || r.type === 'head' || r.type === 'remote')) {
        return c.hash
      }
    }
  }
  return null
}

function isAncestor(repo, ancestor, descendant) {
  if (!ancestor || !descendant) return false
  if (ancestor === descendant) return true
  const parents = new Map(repo.commits.map((c) => [c.hash, c.parents]))
  const seen = new Set()
  const stack = [descendant]
  while (stack.length) {
    const h = stack.pop()
    if (h === ancestor) return true
    if (seen.has(h)) continue
    seen.add(h)
    for (const p of parents.get(h) || []) stack.push(p)
  }
  return false
}

// All ancestors of a commit (including itself).
function ancestorSet(repo, hash) {
  const parents = new Map(repo.commits.map((c) => [c.hash, c.parents]))
  const seen = new Set()
  const stack = [hash]
  while (stack.length) {
    const h = stack.pop()
    if (!h || seen.has(h)) continue
    seen.add(h)
    for (const p of parents.get(h) || []) stack.push(p)
  }
  return seen
}

// Resolve a ref name OR a (possibly abbreviated) commit hash to a full hash.
function resolveTarget(repo, ref) {
  return tipOf(repo, ref) || repo.commits.find((c) => c.hash === ref || c.hash.startsWith(ref))?.hash || null
}

function stripRefs(commits, predicate) {
  for (const c of commits) c.refs = c.refs.filter((r) => !predicate(r))
}

function youNode(extra) {
  return {
    author: { name: 'You', email: '' },
    committer: { name: 'You', email: '' },
    timestamp: Date.now(),
    ghost: true,
    ...extra,
  }
}

export function previewCommit(repo, message) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const label = branch || 'HEAD'

  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))

  const node = youNode({
    hash: ghostHash(),
    parents: headHash ? [headHash] : [],
    subject: message?.trim() || 'Your new commit',
    refs: [{ name: label, type: 'head', ghost: true }],
  })
  commits.unshift(node)

  const note = headHash
    ? `A new commit will be saved on “${label}”. Your branch label moves up to point at it. Everything below stays as it is.`
    : `This will be the very first commit in the repository, starting the “${label}” branch.`
  return { commits, note }
}

export function previewBranch(repo, name) {
  const commits = clone(repo.commits)
  const { hash: headHash } = findHead(repo)
  const clean = (name || '').trim() || 'new-branch'
  for (const c of commits) {
    if (c.hash === headHash) c.refs = [...c.refs, { name: clean, type: 'branch', ghost: true }]
  }
  const note = `A new branch “${clean}” will point at your current commit. Nothing else changes yet. A branch is a label, so you can build new work without disturbing other branches.`
  return { commits, note }
}

export function previewCheckout(repo, ref) {
  const commits = clone(repo.commits)
  const target = resolveTarget(repo, ref)
  const label = /^[0-9a-f]{40,}$/i.test(ref) ? ref.slice(0, 7) : ref
  stripRefs(commits, (r) => r.type === 'head')
  for (const c of commits) {
    if (c.hash === target) c.refs = [...c.refs, { name: label, type: 'head', ghost: true }]
  }
  const note = `You will switch to “${label}”. The history graph stays the same. Only the highlighted HEAD marker (where “you are now”) moves, and your files change to match it.`
  return { commits, note }
}

export function previewCherryPick(repo, hash) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const label = branch || 'HEAD'
  const src = repo.commits.find((c) => c.hash === hash)
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
  const node = youNode({
    hash: ghostHash(),
    parents: headHash ? [headHash] : [],
    subject: 'Copy of: ' + (src?.subject || 'commit'),
    refs: [{ name: label, type: 'head', ghost: true }],
  })
  commits.unshift(node)
  return {
    commits,
    note: `A copy of this commit's changes will be added on top of “${label}”. The original commit stays where it is, so the same change appears in two places in history.`,
  }
}

export function previewRevert(repo, hash) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const label = branch || 'HEAD'
  const src = repo.commits.find((c) => c.hash === hash)
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
  const node = youNode({
    hash: ghostHash(),
    parents: headHash ? [headHash] : [],
    subject: 'Revert: ' + (src?.subject || 'commit'),
    refs: [{ name: label, type: 'head', ghost: true }],
  })
  commits.unshift(node)
  return {
    commits,
    note: `A new commit will be added that undoes this commit's changes. Nothing is erased. Both the original and the “undo” stay visible in history.`,
  }
}

export function previewTag(repo, hash, name) {
  const commits = clone(repo.commits)
  const t = (name || '').trim() || 'new-tag'
  for (const c of commits) {
    if (c.hash === hash) c.refs = [...c.refs, { name: t, type: 'tag', ghost: true }]
  }
  return {
    commits,
    note: `A tag “${t}” will be pinned to this commit. Unlike a branch, a tag never moves, which is why tags are used to mark releases.`,
  }
}

export function previewBranchAt(repo, hash, name) {
  const commits = clone(repo.commits)
  const n = (name || '').trim() || 'new-branch'
  stripRefs(commits, (r) => r.type === 'head')
  for (const c of commits) {
    if (c.hash === hash) c.refs = [...c.refs, { name: n, type: 'head', ghost: true }]
  }
  return {
    commits,
    note: `A new branch “${n}” will start at this commit and you will switch onto it. Use this to fix something from an older point without disturbing other branches.`,
  }
}

export function previewReset(repo, hash, mode) {
  const commits = clone(repo.commits)
  const { branch } = findHead(repo)
  const label = branch || 'HEAD'
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === label))
  for (const c of commits) {
    if (c.hash === hash) c.refs = [...c.refs, { name: label, type: 'head', ghost: true }]
  }
  const extra =
    mode === 'hard'
      ? ' Commits after this point, and any uncommitted changes, will be discarded.'
      : ' Commits after this point leave your branch. Their changes come back to you as edits to re-commit.'
  return {
    commits,
    note: `“${label}” will point at this commit instead of where it is now.${extra}`,
  }
}

export function previewUncommit(repo) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const head = repo.commits.find((c) => c.hash === headHash)
  const parent = head?.parents?.[0]
  if (!parent) return { commits, note: 'There is no previous commit to step back to.' }
  const label = branch || 'HEAD'
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === label))
  for (const c of commits) {
    if (c.hash === parent) c.refs = [...c.refs, { name: label, type: 'head', ghost: true }]
  }
  return {
    commits,
    note: `Your branch label steps back one commit. The undone commit's changes return to your staging area, ready to commit again. Nothing is lost.`,
  }
}

export function previewAmend(repo, message) {
  const commits = clone(repo.commits)
  const { hash: headHash } = findHead(repo)
  const head = commits.find((c) => c.hash === headHash)
  if (!head) return { commits, note: 'There is no commit yet to amend.' }
  head.ghost = true
  if (message && message.trim()) head.subject = message.trim()
  head.author = { name: 'You', email: head.author?.email || '' }
  return {
    commits,
    note: `Your last commit is replaced in place by a new one (new id) that folds in your staged changes${
      message && message.trim() ? ' and this message' : ''
    }. Its position in history does not change, but its ID does, so do not amend a commit you have already shared.`,
  }
}

export function previewRenameBranch(repo, oldName, newName) {
  const commits = clone(repo.commits)
  const n = (newName || '').trim() || 'new-name'
  for (const c of commits) {
    for (const r of c.refs) {
      if ((r.type === 'branch' || r.type === 'head') && r.name === oldName) {
        r.name = n
        r.ghost = true
      }
    }
  }
  return {
    commits,
    note: `The branch label “${oldName}” becomes “${n}”. The commits stay where they are. Only the name changes.`,
  }
}

export function previewMoveBranch(repo, name, hash) {
  const commits = clone(repo.commits)
  stripRefs(commits, (r) => r.type === 'branch' && r.name === name)
  for (const c of commits) {
    if (c.hash === hash) c.refs = [...c.refs, { name, type: 'branch', ghost: true }]
  }
  return {
    commits,
    note: `The branch label “${name}” will jump to this commit. Commits it used to point at stay in history but may no longer be reachable from “${name}”. Your current branch and your files are not touched.`,
  }
}

export function previewCheckoutRemote(repo, remoteBranch) {
  const commits = clone(repo.commits)
  const target = tipOf(repo, remoteBranch)
  const local = remoteBranch.replace(/^[^/]+\//, '')
  stripRefs(commits, (r) => r.type === 'head')
  for (const c of commits) {
    if (c.hash === target) c.refs = [...c.refs, { name: local, type: 'head', ghost: true }]
  }
  return {
    commits,
    note: `A new local branch “${local}” will be created to follow “${remoteBranch}”, and you will switch onto it. From there you can commit and push back to the remote.`,
  }
}

export function previewRestore(repo, hash) {
  const commits = clone(repo.commits)
  const { branch } = findHead(repo)
  const label = branch || 'HEAD'
  const target = commits.find((c) => c.hash === hash || c.hash.startsWith(hash || '\0'))
  if (!target) {
    return {
      commits,
      note: `“${label}” will jump back to an earlier point (${(hash || '').slice(0, 7)}) from your history. That commit is not shown in the current graph, but your files will be restored to exactly how they were then. Anything after it is discarded.`,
    }
  }
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === label))
  for (const c of commits) {
    if (c.hash === target.hash) c.refs = [...c.refs, { name: label, type: 'head', ghost: true }]
  }
  return {
    commits,
    note: `“${label}” will move back to this commit and your files will match it. Commits after this point, and any uncommitted changes, are discarded.`,
  }
}

export function previewRebase(repo, onto) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const ontoHash = resolveTarget(repo, onto)
  if (!ontoHash || !headHash) return { commits, note: `Could not find “${onto}”.` }

  if (isAncestor(repo, ontoHash, headHash)) {
    return { commits, note: `“${branch}” is already on top of “${onto}”, so rebasing would change nothing.` }
  }
  if (isAncestor(repo, headHash, ontoHash)) {
    stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
    for (const c of commits) {
      if (c.hash === ontoHash) c.refs = [...c.refs, { name: branch, type: 'head', ghost: true }]
    }
    return { commits, note: `“${branch}” has no commits of its own beyond “${onto}”, so it moves up to “${onto}”.` }
  }

  const ontoSet = ancestorSet(repo, ontoHash)
  const headSet = ancestorSet(repo, headHash)
  const ordered = repo.commits.filter((c) => headSet.has(c.hash) && !ontoSet.has(c.hash)).slice().reverse()

  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
  let parent = ontoHash
  const ghosts = []
  for (const c of ordered) {
    const node = youNode({ hash: ghostHash(), parents: [parent], subject: c.subject, refs: [] })
    ghosts.push(node)
    parent = node.hash
  }
  if (ghosts.length) ghosts[ghosts.length - 1].refs = [{ name: branch || 'HEAD', type: 'head', ghost: true }]
  for (const node of ghosts) commits.unshift(node)
  return {
    commits,
    note: `Your ${ordered.length} commit${ordered.length === 1 ? '' : 's'} on “${branch}” will be re-applied one by one on top of “${onto}”, so your history becomes a straight line. The originals are replaced by fresh copies (new IDs), so avoid rebasing commits you have already shared.`,
  }
}

// Simulates the outcome of an interactive-rebase plan (the editor's todo list)
// on the graph: dropped commits vanish, squash/fixup fold into the commit above,
// reword changes a subject, and reorders change the order — all as ghost nodes.
export function simulateRebaseTodo(repo, baseHash, items) {
  const commits = clone(repo.commits)
  const { branch } = findHead(repo)
  const label = branch || 'HEAD'

  const originals = new Set(items.map((i) => i.hash))
  const kept = commits.filter((c) => !originals.has(c.hash))
  for (const c of kept) {
    c.refs = (c.refs || []).filter((r) => !(r.type === 'head' || (r.type === 'branch' && r.name === label)))
  }

  let parent = baseHash || null
  const ghosts = []
  let last = null
  let squashed = 0
  let dropped = 0
  let reworded = 0
  for (const it of items) {
    if (it.action === 'drop') {
      dropped++
      continue
    }
    if (it.action === 'pick' || it.action === 'reword') {
      if (it.action === 'reword') reworded++
      const node = youNode({
        hash: ghostHash(),
        parents: parent ? [parent] : [],
        subject: it.action === 'reword' ? it.message || it.subject : it.subject,
        refs: [],
      })
      ghosts.push(node)
      parent = node.hash
      last = node
    } else if (it.action === 'squash' || it.action === 'fixup') {
      squashed++
      if (last) last.squashCount = (last.squashCount || 0) + 1
    }
  }
  for (const n of ghosts) {
    if (n.squashCount) n.subject = `${n.subject}  (+${n.squashCount} squashed)`
  }
  if (last) last.refs = [{ name: label, type: 'head', ghost: true }]

  const note =
    ghosts.length === 0
      ? 'Every commit is dropped, so nothing would remain on this branch above the base.'
      : `Result: ${ghosts.length} commit${ghosts.length === 1 ? '' : 's'} replayed on top of the base` +
        `${squashed ? `, ${squashed} squashed/fixed up` : ''}${dropped ? `, ${dropped} dropped` : ''}${
          reworded ? `, ${reworded} reworded` : ''
        }. These are brand-new commits (new IDs), so avoid this on history you have already shared.`

  return { commits: [...ghosts.reverse(), ...kept], note }
}

export function previewMerge(repo, otherBranch) {
  const commits = clone(repo.commits)
  const { hash: headHash, branch } = findHead(repo)
  const otherHash = tipOf(repo, otherBranch)

  if (!otherHash) return { commits, note: `Could not find the branch “${otherBranch}”.` }

  if (isAncestor(repo, otherHash, headHash)) {
    return {
      commits,
      note: `“${branch}” already contains everything in “${otherBranch}”. Nothing would change because they are already combined.`,
    }
  }

  if (isAncestor(repo, headHash, otherHash)) {
    // Fast-forward: just slide the branch label forward.
    stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
    for (const c of commits) {
      if (c.hash === otherHash) c.refs = [...c.refs, { name: branch, type: 'head', ghost: true }]
    }
    return {
      commits,
      note: `“${branch}” can “fast-forward”: it has no new commits of its own, so its label slides forward to include “${otherBranch}”. No merge commit is needed.`,
    }
  }

  // True merge: a new commit with two parents ties both histories together.
  stripRefs(commits, (r) => r.type === 'head' || (r.type === 'branch' && r.name === branch))
  const node = youNode({
    hash: ghostHash(),
    parents: [headHash, otherHash],
    subject: `Merge branch '${otherBranch}' into ${branch}`,
    refs: [{ name: branch, type: 'head', ghost: true }],
  })
  commits.unshift(node)
  return {
    commits,
    note: `A merge commit will combine “${otherBranch}” into “${branch}”. It has two parents, drawn as two lines flowing into it, and that is how Git ties the two histories together. If the same lines were edited on both, Git will ask you to resolve a conflict.`,
  }
}

// Network / index actions don't reshape the local graph in a way we can show
// precisely, so these return the unchanged graph plus a teaching note.
export function previewFetch(repo) {
  return {
    commits: clone(repo.commits),
    note: `Fetch downloads the latest commits from the remote (e.g. GitHub) and updates your “origin/…” markers. Your own branches do not move and your files stay as they are. You can see what is new before you decide to merge.`,
  }
}

export function previewPull(repo) {
  const behind = repo.status?.behind || 0
  const tail = behind
    ? `The remote has ${behind} commit${behind === 1 ? '' : 's'} you do not have yet, and pull will bring ${behind === 1 ? 'it' : 'them'} in.`
    : `Right now you appear up to date, so this may do nothing.`
  return {
    commits: clone(repo.commits),
    note: `Pull is a fetch and a merge in one step. It downloads new commits from the remote and combines them into your current branch. ${tail}`,
  }
}

export function previewPush(repo) {
  const ahead = repo.status?.ahead || 0
  const tail = ahead
    ? `You have ${ahead} commit${ahead === 1 ? '' : 's'} that are not on the remote yet, and push will upload ${ahead === 1 ? 'it' : 'them'}.`
    : `You do not appear to have local commits to upload right now.`
  return {
    commits: clone(repo.commits),
    note: `Push uploads your local commits to the remote so teammates can see them. It does not change your local history. ${tail}`,
  }
}

export function previewStash(repo) {
  return {
    commits: clone(repo.commits),
    note: `Stash tucks your uncommitted changes away and gives you a clean working directory. Your history does not change, and you can bring the changes back later with “Unstash”.`,
  }
}

export function previewForcePush(repo) {
  const behind = repo.status?.behind || 0
  const tail = behind
    ? `Right now the remote has ${behind} commit${behind === 1 ? '' : 's'} you do not have locally. A force-push will delete ${behind === 1 ? 'it' : 'them'} from the remote branch.`
    : `It overwrites the remote branch with exactly your local history.`
  return {
    commits: clone(repo.commits),
    note: `Force-push replaces the remote branch with your local version. ${tail} Anyone who already pulled the old commits will be left with a broken history, so only do this on a branch that is yours. “--force-with-lease” still refuses if the remote changed since your last fetch.`,
  }
}

// Dispatches to the right preview for a given action descriptor.
export function buildPreview(repo, action) {
  switch (action.type) {
    case 'commit':
      return previewCommit(repo, action.message)
    case 'branch':
      return previewBranch(repo, action.name)
    case 'checkout':
      return previewCheckout(repo, action.ref)
    case 'merge':
      return previewMerge(repo, action.branch)
    case 'cherryPick':
      return previewCherryPick(repo, action.hash)
    case 'revert':
      return previewRevert(repo, action.hash)
    case 'tag':
      return previewTag(repo, action.hash, action.name)
    case 'branchAt':
      return previewBranchAt(repo, action.hash, action.name)
    case 'reset':
      return previewReset(repo, action.hash, action.mode)
    case 'uncommit':
      return previewUncommit(repo)
    case 'amend':
      return previewAmend(repo, action.message)
    case 'renameBranch':
      return previewRenameBranch(repo, action.oldName, action.name)
    case 'moveBranch':
      return previewMoveBranch(repo, action.name, action.hash)
    case 'checkoutRemote':
      return previewCheckoutRemote(repo, action.ref)
    case 'restore':
      return previewRestore(repo, action.hash)
    case 'rebase':
      return previewRebase(repo, action.onto)
    case 'fetch':
      return previewFetch(repo)
    case 'pull':
      return previewPull(repo)
    case 'push':
      return previewPush(repo)
    case 'forcePush':
      return previewForcePush(repo)
    case 'stash':
      return previewStash(repo)
    default:
      return { commits: clone(repo.commits), note: '' }
  }
}
