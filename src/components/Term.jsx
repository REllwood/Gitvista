import { useContext } from 'react'
import { GLOSSARY } from '../lib/glossary'
import { HelpContext } from '../lib/helpContext'

// Wraps a word/phrase so hovering shows a plain-language definition, and
// clicking opens the full Help panel at that term.
export default function Term({ id, children }) {
  const openHelp = useContext(HelpContext)
  const def = GLOSSARY[id]
  if (!def) return <>{children}</>
  return (
    <span
      className="term"
      tabIndex={0}
      role="button"
      onClick={(e) => {
        e.stopPropagation()
        openHelp(id)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openHelp(id)
        }
      }}
    >
      {children || def.title}
      <span className="term-tip" role="tooltip">
        <strong>{def.title}</strong>
        <span>{def.short}</span>
        <em>Click to learn more</em>
      </span>
    </span>
  )
}
