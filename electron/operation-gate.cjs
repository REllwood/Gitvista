// Mutations are exclusive across the desktop window. Reject a second intent
// instead of queuing it against a repository state the user has not reviewed.
function createOperationGate() {
  let active = null
  return async function run(label, task) {
    if (active) throw new Error(`${active}. Wait for it to finish before starting another operation.`)
    active = label
    try {
      return await task()
    } finally {
      active = null
    }
  }
}

module.exports = { createOperationGate }
