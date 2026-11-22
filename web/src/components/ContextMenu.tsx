import { useEffect, useLayoutEffect, useRef } from 'react'
import type { Colour } from '../types'
import { useSettings } from '../settings'
import { Icon } from './Icon'
import type { IconName, Tone } from './Icon'

export type MenuEntry =
  | { type: 'item'; label: string; icon?: IconName; tone?: Tone; onSelect: () => void; disabled?: boolean; danger?: boolean }
  | { type: 'sep' }
  | { type: 'head'; label: string }
  | { type: 'swatches'; current?: Colour; onPick: (c: Colour | undefined) => void }

interface Props {
  x: number
  y: number
  entries: MenuEntry[]
  onClose: () => void
}

/** Right-click menu: keyboard (arrows, Enter, Esc) and pointer, clamped inside the viewport. */
export function ContextMenu({ x, y, entries, onClose }: Props) {
  const { colours } = useSettings()
  const ref = useRef<HTMLDivElement>(null)

  // Keep the whole menu on screen whatever its height (measured after it is drawn).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.maxHeight = `${window.innerHeight - 16}px`
    el.style.overflowY = 'auto'
    const h = el.getBoundingClientRect().height
    el.style.top = `${Math.max(8, Math.min(y, window.innerHeight - h - 8))}px`
  }, [y, entries.length])

  // The first item takes the focus once, when the menu opens; not again when the app around it redraws (that moved the
  // arrow-key highlight back to the top every few seconds, the same flaw as the Reference number window, 2026-11-22).
  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const onDown = (e: PointerEvent) => {
      if (!el.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const items = Array.from(el.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
        const i = items.indexOf(document.activeElement as HTMLButtonElement)
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length
        items[next]?.focus()
      }
    }
    window.addEventListener('pointerdown', onDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('blur', onClose)
    window.addEventListener('resize', onClose)
    return () => {
      window.removeEventListener('pointerdown', onDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', onClose)
      window.removeEventListener('resize', onClose)
    }
  }, [onClose])

  return (
    <div ref={ref} className="ctx mctx" role="menu" style={{ left: Math.max(8, Math.min(x, window.innerWidth - 248)), top: Math.max(8, Math.min(y, window.innerHeight - 440)) }}>
      {entries.map((en, i) => {
        if (en.type === 'sep') return <div key={i} className="menu-sep" role="separator" />
        if (en.type === 'head') {
          return (
            <div key={i} className="menu-head">
              {en.label}
            </div>
          )
        }
        if (en.type === 'swatches') {
          return (
            <div key={i} className="swatches" role="group" aria-label="Colour category">
              {colours.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className={`swatch c-${c.id}${en.current === c.id ? ' on' : ''}`}
                  aria-label={c.label}
                  aria-pressed={en.current === c.id}
                  onClick={() => {
                    en.onPick(c.id)
                    onClose()
                  }}
                />
              ))}
              <button
                type="button"
                className="swatch none"
                aria-label="Clear category"
                onClick={() => {
                  en.onPick(undefined)
                  onClose()
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          )
        }
        return (
          <button
            key={i}
            type="button"
            role="menuitem"
            className={`ctx-item${en.danger ? ' danger' : ''}`}
            disabled={en.disabled}
            onClick={() => {
              en.onSelect()
              onClose()
            }}
          >
            <span className="ph">{en.icon && <Icon name={en.icon} size={15} tone={en.tone} />}</span>
            {en.label}
          </button>
        )
      })}
    </div>
  )
}
