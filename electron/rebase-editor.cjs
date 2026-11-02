// GitVista's editor accepts Git's prepared squash/merge messages and only
// replaces messages explicitly marked for reword in the reviewed plan.
const fs = require('fs')

try {
  const target = process.argv[2]
  if (!target) throw new Error('Git did not provide an editor target.')
  if (/git-rebase-todo$/.test(target)) {
    fs.copyFileSync(process.env.GV_TODO_FILE, target)
  } else {
    const done = fs.readFileSync(process.env.GV_REBASE_DONE, 'utf8').trim().split('\n')
    const [action, hash] = done.at(-1).split(/\s+/)
    if (action === 'reword') {
      const messages = JSON.parse(fs.readFileSync(process.env.GV_MESSAGES, 'utf8'))
      const entry = Object.entries(messages).find(([key]) => key === hash || key.startsWith(hash))
      if (!entry || typeof entry[1] !== 'string' || !entry[1].trim()) throw new Error('The planned reword message is missing.')
      fs.writeFileSync(target, entry[1].trimEnd() + '\n')
    }
  }
} catch (error) {
  process.stderr.write(`GitVista could not apply the rebase plan: ${error.message}\n`)
  process.exitCode = 1
}
