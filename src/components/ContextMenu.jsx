import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'

// A lightweight right-click menu rendered at (x, y), clamped to the viewport.
// `items` is a list of { label, icon, danger, hint, onClick } or { divider }.
export default function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ top: y, left: x })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    let nx = x
    let ny = y
    if (x + r.width > window.innerWidth) nx = window.innerWidth - r.width - 8
    if (y + r.height > window.innerHeight) ny = window.innerHeight - r.height - 8
    setPos({ top: Math.max(8, ny), left: Math.max(8, nx) })
  }, [x, y])

  useEffect(() => {
    ref.current?.querySelector('button')?.focus()
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const buttons = [...(ref.current?.querySelectorAll('button') || [])]
        const current = buttons.indexOf(document.activeElement)
        const delta = e.key === 'ArrowDown' ? 1 : -1
        buttons[(current + delta + buttons.length) % buttons.length]?.focus()
      }
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div className="context-menu" style={pos} ref={ref} role="menu">
      {items.map((it, i) =>
        it.divider ? (
          <div key={i} className="cm-divider" />
        ) : (
          <button
            key={i}
            className={'cm-item' + (it.danger ? ' danger' : '')}
            role="menuitem"
            onClick={() => {
              onClose()
              it.onClick?.()
            }}
          >
            {it.icon && <Icon name={it.icon} size={14} />}
            <span className="cm-label">{it.label}</span>
            {it.hint && <span className="cm-hint">{it.hint}</span>}
          </button>
        )
      )}
    </div>
  )
}
