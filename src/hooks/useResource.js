import { useCallback, useEffect, useRef } from 'react'
import useMachine from './useMachine'
import { resourceMachine } from '../lib/machines'

// Loads data for a panel through the resource machine. load({ isLatest }) returns
// a promise of the data and throws on failure. isLatest() turns false once a
// newer request starts, so a debounced loader can skip work nobody will see. It runs again whenever a value in deps
// changes, and reload() runs it on demand, for a Try again button. Only the
// latest request's answer is kept. With keepData, the previous data stays on
// screen while a reload runs, so the view does not flash empty.
export default function useResource(load, deps, { enabled = true, keepData = false } = {}) {
  const [state, send, current] = useMachine(resourceMachine)
  const loader = useRef(load)
  loader.current = load

  const reload = useCallback(() => {
    send({ type: 'LOAD', keepData })
    const request = current.current.context.request
    const isLatest = () => current.current.context.request === request
    Promise.resolve()
      .then(() => loader.current({ isLatest }))
      .then(
        (data) => send({ type: 'RESOLVE', request, data }),
        (error) => send({ type: 'REJECT', request, error: error?.message || String(error) })
      )
  }, [send, current, keepData])

  const update = useCallback((change) => send({ type: 'UPDATE', update: change }), [send])

  useEffect(() => {
    if (enabled) reload()
    // deps are the caller's inputs, the same contract as useEffect.
  }, [enabled, reload, ...deps]) // eslint-disable-line react-hooks/exhaustive-deps

  return { status: state.value, data: state.context.data, error: state.context.error, reload, update }
}
