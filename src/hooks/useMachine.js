import { useCallback, useRef, useState } from 'react'

// Runs a machine from machine.js inside a component. send() applies the event
// at once and returns true when the machine accepted it, so a handler can use it
// as a synchronous guard (for example, refuse to start a second operation).
export default function useMachine(machine, initialState = machine.initialState) {
  const [state, setState] = useState(initialState)
  const current = useRef(initialState)

  const send = useCallback(
    (event) => {
      const next = machine.transition(current.current, event)
      if (next === current.current) return false
      current.current = next
      setState(next)
      return true
    },
    [machine]
  )

  return [state, send, current]
}
