// Explicit state machines. A machine names its states and, for each state, the
// events it accepts and the state each event leads to. An event the current
// state does not accept leaves the state unchanged, so combinations such as
// "loading and failed at once" cannot occur. Every machine in the app is listed
// in machines.js, where a test checks that each transition leads somewhere real.

export function defineMachine({ id, initial, context = {}, states }) {
  if (!states[initial]) throw new Error(`${id}: unknown initial state "${initial}"`)
  for (const [name, node] of Object.entries(states)) {
    for (const [type, edge] of Object.entries(node.on || {})) {
      // A computed target lists every state it can return in `targets`.
      const targets = typeof edge === 'string' ? [edge] : typeof edge.target === 'function' ? edge.targets || [] : [edge.target]
      if (typeof edge === 'object' && typeof edge.target === 'function' && !edge.targets?.length) {
        throw new Error(`${id}: ${name} on ${type} computes its target but does not list its targets`)
      }
      for (const target of targets) {
        if (target !== undefined && !states[target]) throw new Error(`${id}: ${name} on ${type} leads to unknown state "${target}"`)
      }
    }
  }

  const initialState = Object.freeze({ value: initial, context })

  // Returns the next state, or the same object when the event is not accepted
  // here or its guard refuses it, so callers can tell an ignored event apart.
  function transition(state, event) {
    const edge = states[state.value]?.on?.[event.type]
    if (!edge) return state
    const step = typeof edge === 'string' ? { target: edge } : edge
    if (step.when && !step.when(state.context, event)) return state
    const context = step.update ? { ...state.context, ...step.update(state.context, event) } : state.context
    const value = typeof step.target === 'function' ? step.target(context, event) : step.target ?? state.value
    if (!states[value]) throw new Error(`${id}: ${state.value} on ${event.type} computed unknown state "${value}"`)
    return Object.freeze({ value, context })
  }

  const accepts = (state, type) => Boolean(states[state.value]?.on?.[type])

  return Object.freeze({ id, initial, states, initialState, transition, accepts })
}
