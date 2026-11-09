import { Children, cloneElement, useLayoutEffect, useRef } from 'react'

const focusable = (element) => [...element.querySelectorAll('button, input, textarea, select, a[href], [tabindex]')]
  .filter((node) => !node.disabled && node.tabIndex >= 0 && node.getClientRects().length > 0)

// Overlays in the order they opened. The last one is on top, so it alone
// answers Escape and keeps Tab focus, even when an overlay opened later sits
// earlier in the page (help opened from a term inside Settings, for example).
const openOverlays = []

// Shared keyboard behaviour for dialogs, including nested dialogs. The existing
// dismiss callback owns whether an in-progress operation can be interrupted.
export default function ModalOverlay({ children, onClick, className = 'modal-overlay' }) {
  const overlay = useRef(null)
  const dismiss = useRef(onClick)
  dismiss.current = onClick
  useLayoutEffect(() => {
    const element = overlay.current
    const previous = document.activeElement
    const dialog = element.querySelector('[role="dialog"]')
    if (dialog && !dialog.hasAttribute('aria-label') && !dialog.hasAttribute('aria-labelledby')) {
      const title = dialog.querySelector('.modal-title, h2, h3')
      dialog.setAttribute('aria-label', title?.textContent || 'GitVista dialogue')
    }
    if (!element.contains(document.activeElement)) (focusable(element)[0] || dialog || element).focus()
    openOverlays.push(element)
    const onKey = (event) => {
      if (openOverlays.at(-1) !== element) return
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopImmediatePropagation()
        dismiss.current?.(event)
      } else if (event.key === 'Tab') {
        const controls = focusable(element)
        const first = controls[0]
        const last = controls.at(-1)
        if (!first) { event.preventDefault(); (dialog || element).focus(); return }
        if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) {
          event.preventDefault(); last.focus()
        } else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) {
          event.preventDefault(); first.focus()
        }
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => {
      openOverlays.splice(openOverlays.indexOf(element), 1)
      window.removeEventListener('keydown', onKey, true)
      if (previous?.isConnected) previous.focus({ preventScroll: true })
    }
  }, [])
  const child = Children.only(children)
  return <div className={className} ref={overlay} data-modal-overlay="" tabIndex={-1} onClick={onClick}>
    {cloneElement(child, { role: 'dialog', 'aria-modal': true, tabIndex: -1 })}
  </div>
}
