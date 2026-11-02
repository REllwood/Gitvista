import { useEffect, useRef } from 'react'
import { GLOSSARY, HELP_TOPICS } from '../lib/glossary'
import Icon from './Icon'

// Slide-in glossary. Opening it at a specific term scrolls that term into view
// and highlights it.
export default function HelpPanel({ openTerm, onClose }) {
  const refs = useRef({})
  useEffect(() => {
    if (openTerm && refs.current[openTerm]) {
      refs.current[openTerm].scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [openTerm])

  return (
    <div className="help-overlay" onClick={onClose}>
      <aside className="help-panel" onClick={(e) => e.stopPropagation()}>
        <div className="help-head">
          <span>Git, in plain English</span>
          <button className="icon-btn" onClick={onClose} aria-label="Close help">
            <Icon name="x" />
          </button>
        </div>
        <div className="help-body">
          {HELP_TOPICS.map((id) => {
            const d = GLOSSARY[id]
            return (
              <div
                key={id}
                ref={(el) => {
                  refs.current[id] = el
                }}
                className={'help-item' + (openTerm === id ? ' hl' : '')}
              >
                <div className="help-term">{d.title}</div>
                <div className="help-short">{d.short}</div>
                <div className="help-long">{d.long}</div>
              </div>
            )
          })}
        </div>
      </aside>
    </div>
  )
}
