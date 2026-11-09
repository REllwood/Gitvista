import test from 'node:test'
import assert from 'node:assert/strict'
import { defineMachine } from '../../src/lib/machine.js'
import { MACHINES, operationMachine, surfaceMachine } from '../../src/lib/machines.js'

const targetsOf = (edge) =>
  typeof edge === 'string' ? [edge] : typeof edge.target === 'function' ? edge.targets : [edge.target ?? null]

test('every registered machine can reach each of its states and leave each one', () => {
  for (const machine of MACHINES) {
    const reached = new Set([machine.initial])
    const queue = [machine.initial]
    while (queue.length) {
      const name = queue.shift()
      for (const edge of Object.values(machine.states[name].on || {})) {
        for (const target of targetsOf(edge)) {
          if (target && !reached.has(target)) {
            reached.add(target)
            queue.push(target)
          }
        }
      }
    }
    assert.deepEqual([...reached].sort(), Object.keys(machine.states).sort(), `${machine.id} has unreachable states`)
    for (const [name, node] of Object.entries(machine.states)) {
      assert.ok(Object.keys(node.on || {}).length > 0, `${machine.id}.${name} has no way out`)
    }
  }
})

test('a machine definition with a missing state is rejected', () => {
  assert.throws(() => defineMachine({ id: 'broken', initial: 'idle', states: { idle: { on: { GO: 'nowhere' } } } }), /unknown state "nowhere"/)
  assert.throws(
    () => defineMachine({ id: 'computed', initial: 'idle', states: { idle: { on: { GO: { target: () => 'idle' } } } } }),
    /does not list its targets/
  )
})

test('only one operation runs at a time and it remembers what is running', () => {
  const idle = operationMachine.initialState
  const committing = operationMachine.transition(idle, { type: 'START', kind: 'commit' })
  assert.equal(committing.value, 'running')
  assert.equal(committing.context.kind, 'commit')
  assert.equal(operationMachine.transition(committing, { type: 'START', kind: 'push' }), committing)
  const finished = operationMachine.transition(committing, { type: 'FINISH' })
  assert.deepEqual([finished.value, finished.context.kind], ['idle', null])
  assert.equal(operationMachine.transition(idle, { type: 'FINISH' }), idle)
})

test('surfaces stack in the order they open and close independently', () => {
  let state = surfaceMachine.initialState
  const send = (event) => (state = surfaceMachine.transition(state, event))
  send({ type: 'OPEN', surface: 'settings', props: true })
  send({ type: 'OPEN', surface: 'help', props: true })
  assert.deepEqual(state.context.stack.map((entry) => entry.surface), ['settings', 'help'])
  send({ type: 'OPEN', surface: 'settings', props: { tab: 'github' } })
  assert.deepEqual(state.context.stack.map((entry) => entry.surface), ['help', 'settings'])
  assert.deepEqual(state.context.stack.at(-1).props, { tab: 'github' })
  const before = state
  assert.equal(send({ type: 'CLOSE', surface: 'diff' }), before)
  send({ type: 'CLOSE', surface: 'help' })
  assert.equal(state.value, 'open')
  send({ type: 'CLOSE', surface: 'settings' })
  assert.equal(state.value, 'closed')
  assert.deepEqual(state.context.stack, [])
})
