// Plain-language explanations of Git jargon. Used both for hover tooltips
// (the <Term> component) and the slide-in Help panel. Written for someone who
// has never used Git.

export const GLOSSARY = {
  commit: {
    title: 'Commit',
    short: 'A saved snapshot of your project at a moment in time.',
    long: 'Think of a commit as a “save point” in a video game. It records exactly what every file looked like, who made the change, and when. You can always travel back to any commit.',
  },
  branch: {
    title: 'Branch',
    short: 'A separate line of work you can build on without affecting others.',
    long: 'A branch is like a parallel copy of your project where you can try things out. The main branch usually holds the “real” version; you make new branches to work on features safely, then merge them back.',
  },
  merge: {
    title: 'Merge',
    short: 'Combine the work from one branch into another.',
    long: 'Merging takes the commits from another branch and weaves them into yours. If both branches changed the same lines, Git asks you to pick which version wins — that’s a “conflict”.',
  },
  HEAD: {
    title: 'HEAD',
    short: 'A pointer to where “you are now” in the history.',
    long: 'HEAD marks the commit your working files currently match. When you switch branches, HEAD moves. It’s highlighted in the graph so you always know your current position.',
  },
  remote: {
    title: 'Remote',
    short: 'A copy of the project hosted elsewhere, like on GitHub.',
    long: 'A remote (usually called “origin”) is the shared copy of your repo on a server. You push your commits up to it and pull others’ commits down from it.',
  },
  origin: {
    title: 'origin',
    short: 'The default name for your main remote (e.g. GitHub).',
    long: '“origin” is just the nickname Git gives the remote you cloned from. Branches on it show up as “origin/main”, “origin/dev”, and so on.',
  },
  stage: {
    title: 'Stage',
    short: 'Choosing which changes go into your next commit.',
    long: 'Before committing, you “stage” the specific changes you want to include. This lets you commit some changes now and save others for later.',
  },
  stash: {
    title: 'Stash',
    short: 'Temporarily set aside uncommitted changes.',
    long: 'A stash safely tucks away changes you’re not ready to commit, giving you a clean slate. You can pop the stash later to get them back.',
  },
  push: {
    title: 'Push',
    short: 'Upload your commits to the remote.',
    long: 'Pushing sends the commits you’ve made locally up to the shared remote so your teammates can see and use them.',
  },
  pull: {
    title: 'Pull',
    short: 'Download and merge the latest commits from the remote.',
    long: 'Pulling fetches new commits from the remote and merges them into your current branch in one step, keeping you up to date with everyone else.',
  },
  fetch: {
    title: 'Fetch',
    short: 'Download remote changes without merging them yet.',
    long: 'Fetch quietly downloads what’s new on the remote so you can look before you leap. Unlike pull, it doesn’t change your own branches.',
  },
  checkout: {
    title: 'Switch (checkout)',
    short: 'Move to a different branch or commit.',
    long: 'Switching changes your working files to match another branch or commit and moves HEAD there. Your saved commits are never lost by switching.',
  },
  tag: {
    title: 'Tag',
    short: 'A friendly name pinned to a specific commit.',
    long: 'Tags mark important commits — most often release versions like “v1.0”. Unlike branches, tags don’t move.',
  },
  conflict: {
    title: 'Merge conflict',
    short: 'When two changes to the same lines must be reconciled by hand.',
    long: 'If two branches edited the same part of a file differently, Git can’t guess which to keep, so it pauses and asks you to choose. Resolving means editing the file to the version you want, then committing.',
  },
  fastforward: {
    title: 'Fast-forward',
    short: 'A merge with nothing to combine — the label just slides forward.',
    long: 'If your branch has no commits of its own since the other branch moved ahead, merging simply moves your branch label forward. No merge commit is created.',
  },
  repository: {
    title: 'Repository (repo)',
    short: 'The project folder Git is tracking, plus its full history.',
    long: 'A repository is your project folder together with the hidden “.git” history of every change ever committed.',
  },
}

// Ordered list for the Help panel.
export const HELP_TOPICS = [
  'repository',
  'commit',
  'branch',
  'HEAD',
  'stage',
  'merge',
  'conflict',
  'fastforward',
  'checkout',
  'remote',
  'push',
  'pull',
  'fetch',
  'stash',
  'tag',
]
