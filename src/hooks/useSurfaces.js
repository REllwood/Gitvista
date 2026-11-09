import { useRef } from 'react'
import useMachine from './useMachine'
import { surfaceMachine } from '../lib/machines'

const read = (stack, name, closedValue) => {
  const entry = stack.find((item) => item.surface === name)
  return entry ? entry.props : closedValue
}

// Runs the surface machine for the app shell. slot(name) returns a
// [value, setter] pair shaped like useState, so each dialog keeps its familiar
// setAction(...) or setSettingsOpen(true) call while the machine records what is
// open and in which order. A closed slot reads as closedValue (null or false).
// Setters are stable across renders, like React's own.
export default function useSurfaces() {
  const [state, send, current] = useMachine(surfaceMachine)
  const setters = useRef(new Map())
  const stack = state.context.stack

  const slot = (name, closedValue = null) => {
    if (!setters.current.has(name)) {
      setters.current.set(name, (next) => {
        const resolved = typeof next === 'function' ? next(read(current.current.context.stack, name, closedValue)) : next
        if (resolved === null || resolved === undefined || resolved === false) send({ type: 'CLOSE', surface: name })
        else send({ type: 'OPEN', surface: name, props: resolved })
      })
    }
    return [read(stack, name, closedValue), setters.current.get(name)]
  }

  return { stack, top: stack.at(-1)?.surface ?? null, slot }
}
