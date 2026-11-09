// Every explicit state machine in the renderer, in one place. Each one replaces
// a group of flags that used to change independently. The running app shows the
// current state of each machine as a data-* attribute so tests and automation
// can read it: data-operation and data-surface on the app root, data-state on
// each panel that loads data.
import { defineMachine } from './machine.js'

// What GitVista is doing. Only one operation runs at a time, matching the
// main process's operation gate, so START is refused while one is running.
export const operationMachine = defineMachine({
  id: 'operation',
  initial: 'idle',
  context: { kind: null },
  states: {
    idle: { on: { START: { target: 'running', update: (_, event) => ({ kind: event.kind }) } } },
    running: { on: { FINISH: { target: 'idle', update: () => ({ kind: null }) } } },
  },
})

const withoutSurface = (stack, surface) => stack.filter((entry) => entry.surface !== surface)
const stackState = (context) => (context.stack.length ? 'open' : 'closed')

// The dialogs, panels and menus on screen, in the order they opened. Opening a
// surface that is already open moves it to the top with its new details.
export const surfaceMachine = defineMachine({
  id: 'surfaces',
  initial: 'closed',
  context: { stack: [] },
  states: {
    closed: {
      on: {
        OPEN: { target: 'open', update: (context, event) => ({ stack: [{ surface: event.surface, props: event.props }] }) },
      },
    },
    open: {
      on: {
        OPEN: {
          update: (context, event) => ({ stack: [...withoutSurface(context.stack, event.surface), { surface: event.surface, props: event.props }] }),
        },
        CLOSE: {
          when: (context, event) => context.stack.some((entry) => entry.surface === event.surface),
          update: (context, event) => ({ stack: withoutSurface(context.stack, event.surface) }),
          target: stackState,
          targets: ['open', 'closed'],
        },
      },
    },
  },
})

export const MACHINES = [operationMachine, surfaceMachine]
