import ModalOverlay from './ModalOverlay'
import { useEffect, useMemo, useRef, useState } from 'react'
import Icon from './Icon'
import { commandScore } from '../lib/commandSearch'

export default function CommandPalette({ commands, onClose }) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(0)
  const [executing, setExecuting] = useState(null)
  const inputRef = useRef(null)
  const results = useMemo(
    () =>
      commands
        .map((command) => ({ command, score: commandScore(command, query.trim()) }))
        .filter((item) => item.score >= 0)
        .sort((a, b) => b.score - a.score)
        .map((item) => item.command),
    [commands, query]
  )

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    setSelected(0)
  }, [query])

  const run = async (command) => {
    if (!command || command.disabled || executing) return
    setExecuting(command.id)
    try {
      await command.run()
      onClose()
    } finally {
      setExecuting(null)
    }
  }

  // Escape and Tab are handled by ModalOverlay, like every other dialog.
  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setSelected((index) => Math.min(index + 1, Math.max(results.length - 1, 0)))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setSelected((index) => Math.max(index - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      run(results[selected])
    }
  }

  return (
    <ModalOverlay className="command-overlay" onClick={onClose}>
      <section
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="command-search">
          <Icon name="search" size={17} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Type a command…"
            aria-label="Search commands"
            aria-activedescendant={results[selected] ? `command-${results[selected].id}` : undefined}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="command-results" role="listbox">
          {results.length === 0 && <div className="command-empty">No matching commands.</div>}
          {results.map((command, index) => (
            <button
              id={`command-${command.id}`}
              key={command.id}
              type="button"
              role="option"
              aria-selected={index === selected}
              className={index === selected ? 'selected' : ''}
              disabled={command.disabled || !!executing}
              onMouseEnter={() => setSelected(index)}
              onClick={() => run(command)}
            >
              <span className="command-icon">
                {executing === command.id ? <span className="spinner" /> : <Icon name={command.icon || 'commit'} size={15} />}
              </span>
              <span className="command-name">
                <strong>{command.label}</strong>
                <small>{command.category}</small>
              </span>
              {command.shortcut && <kbd>{command.shortcut}</kbd>}
            </button>
          ))}
        </div>
        <footer className="command-hints">
          <span><kbd>↑</kbd><kbd>↓</kbd> Navigate</span>
          <span><kbd>Enter</kbd> Run</span>
        </footer>
      </section>
    </ModalOverlay>
  )
}
