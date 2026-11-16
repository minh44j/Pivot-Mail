/**
 * Keyboard behaviour shared by every dialog (any element with class `modal-backdrop`):
 * - Tab and Shift+Tab stay inside the topmost dialog.
 * - When the dialog closes, focus goes back to where it was before it opened.
 * Installed once; individual dialogs only need to handle Escape.
 */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [contenteditable="true"]'

const topModal = (): HTMLElement | null => {
  const all = document.querySelectorAll<HTMLElement>('.modal-backdrop')
  return all.length > 0 ? (all[all.length - 1] ?? null) : null
}

const visible = (el: HTMLElement): boolean => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden'

export function installModalFocus(): () => void {
  let lastOutside: HTMLElement | null = null
  let wasOpen = false
  let current: HTMLElement | null = null

  const onFocusIn = (e: FocusEvent) => {
    const t = e.target as HTMLElement | null
    if (t && !t.closest('.modal-backdrop') && t !== document.body) lastOutside = t
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return
    const modal = topModal()
    if (!modal) return
    const items = Array.from(modal.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible)
    if (items.length === 0) {
      e.preventDefault()
      return
    }
    const first = items[0] as HTMLElement
    const last = items[items.length - 1] as HTMLElement
    const a = document.activeElement as HTMLElement | null
    const inside = a ? modal.contains(a) : false
    if (!inside) {
      e.preventDefault()
      ;(e.shiftKey ? last : first).focus()
    } else if (e.shiftKey && a === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && a === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const mo = new MutationObserver(() => {
    const top = topModal()
    // A dialog just opened: make sure focus is inside it (first control), so keyboard and screen-reader users land there.
    if (top && top !== current && !top.contains(document.activeElement)) {
      const first = Array.from(top.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(visible)[0]
      window.setTimeout(() => (first ?? top).focus(), 0)
    }
    current = top
    const open = top !== null
    if (wasOpen && !open && lastOutside && document.contains(lastOutside)) {
      const target = lastOutside
      window.setTimeout(() => {
        if (!topModal()) target.focus()
      }, 0)
    }
    wasOpen = open
  })
  mo.observe(document.body, { childList: true, subtree: true })

  document.addEventListener('focusin', onFocusIn)
  document.addEventListener('keydown', onKeyDown, true)
  return () => {
    mo.disconnect()
    document.removeEventListener('focusin', onFocusIn)
    document.removeEventListener('keydown', onKeyDown, true)
  }
}
