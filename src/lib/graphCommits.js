// Prepares the commit list that the history graph draws. Git records every
// stash as a commit with extra "index on" and "untracked files on" parents, so
// stash commits keep only their first parent here and those helper commits stay
// out of the graph. Uncommitted work appears as a WIP row on top of HEAD.

export const WIP_HASH = 'gitvista-wip'

export function prepareGraphCommits(commits, { stashes = [], head = null, wipCount = 0, hideStashes = false } = {}) {
  const stashByHash = new Map(stashes.filter((stash) => stash.hash).map((stash) => [stash.hash, stash]))
  const helpers = new Set()
  for (const commit of commits) {
    if (stashByHash.has(commit.hash)) for (const parent of commit.parents.slice(1)) helpers.add(parent)
  }
  for (const commit of commits) {
    if (stashByHash.has(commit.hash)) continue
    for (const parent of commit.parents) helpers.delete(parent)
    if (commit.refs?.length) helpers.delete(commit.hash)
  }

  const prepared = []
  for (const commit of commits) {
    if (helpers.has(commit.hash)) continue
    const stash = stashByHash.get(commit.hash)
    if (stash && hideStashes) continue
    prepared.push(stash ? { ...commit, parents: commit.parents.slice(0, 1), stash } : commit)
  }

  if (wipCount > 0 && head) {
    prepared.unshift({
      hash: WIP_HASH,
      parents: [head],
      subject: 'Uncommitted changes',
      refs: [],
      wip: { count: wipCount },
    })
  }
  return prepared
}

// Groups a commit's refs into the pills the graph shows. A local branch and a
// remote branch of the same name on the same commit become one pill that is
// marked as in sync with the remote, so a pushed branch does not appear twice.
export function groupRefs(refs = []) {
  const syncedRemotes = new Set()
  const pills = []
  for (const ref of refs) {
    if (ref.type === 'head' || ref.type === 'branch') {
      const remotes = refs.filter((other) => other.type === 'remote' && other.name.split('/').slice(1).join('/') === ref.name)
      remotes.forEach((remote) => syncedRemotes.add(remote.name))
      pills.push({ ...ref, synced: remotes.map((remote) => remote.name) })
    }
  }
  for (const ref of refs) {
    if (ref.type === 'head' || ref.type === 'branch') continue
    if (ref.type === 'remote' && syncedRemotes.has(ref.name)) continue
    pills.push({ ...ref, synced: [] })
  }
  // The current branch leads, then other local branches, remotes and tags.
  const order = { head: 0, detached: 0, branch: 1, remote: 2, tag: 3 }
  return pills.sort((a, b) => (order[a.type] ?? 4) - (order[b.type] ?? 4))
}

// The commits that belong to a branch alone: its first-parent chain from the
// tip, stopping where it meets the current branch's history. Hovering a branch
// pill highlights these so beginners can see which commits a branch adds.
export function branchOwnCommits(nodes, tipHash, headHash) {
  const byHash = new Map(nodes.map((node) => [node.hash, node]))
  const headLine = new Set()
  for (let hash = headHash; hash && byHash.has(hash) && !headLine.has(hash); hash = byHash.get(hash).parents[0]) headLine.add(hash)
  const own = new Set()
  const startsOnHead = headLine.has(tipHash)
  for (let hash = tipHash; hash && byHash.has(hash) && !own.has(hash); hash = byHash.get(hash).parents[0]) {
    if (!startsOnHead && headLine.has(hash)) break
    own.add(hash)
  }
  return own
}
