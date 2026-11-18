import { useRef } from 'react'
import type { KeyboardEvent as RKeyboardEvent, PointerEvent as RPointerEvent } from 'react'

export type SplitKind = 'folders' | 'list' | 'height'

const VAR: Record<SplitKind, string> = { folders: '--folders-w', list: '--list-w', height: '--list-h' }
const MIN: Record<SplitKind, number> = { folders: 180, list: 280, height: 140 }
const READER_MIN = 360
const READER_MIN_H = 200

/**
 * The bar between two panes. Drag it (or focus it and use the arrow keys) to make the pane on its left (or above it) wider or narrower.
 * Double-click to go back to the default size. While dragging, the size is written straight to the page (smooth);
 * the final size is handed to `onChange` once, to be remembered.
 */
export function PaneSplitter(props: { kind: SplitKind; label: string; value: number | null; onChange: (v: number | null) => void }) {
  const { kind, label, value, onChange } = props
  const bar = useRef<HTMLDivElement>(null)
  const vertical = kind !== 'height'

  const parts = () => {
    const ws = bar.current?.closest<HTMLElement>('.workspace') ?? null
    const app = ws?.closest<HTMLElement>('.app') ?? null
    const folders = ws?.querySelector<HTMLElement>('.folders') ?? null
    const list = ws?.querySelector<HTMLElement>('.list') ?? null
    return { ws, app, folders, list }
  }
  const limits = (): { min: number; max: number } => {
    const { ws, folders, list } = parts()
    if (!ws) return { min: MIN[kind], max: MIN[kind] }
    if (kind === 'folders') return { min: MIN.folders, max: 380 }
    if (kind === 'list') return { min: MIN.list, max: Math.max(MIN.list, Math.min(760, ws.clientWidth - (folders?.offsetWidth ?? 0) - READER_MIN)) }
    return { min: MIN.height, max: Math.max(MIN.height, (list?.parentElement?.clientHeight ?? ws.clientHeight) - READER_MIN_H) }
  }
  const current = (): number => {
    const { folders, list } = parts()
    return Math.round(kind === 'folders' ? (folders?.offsetWidth ?? 240) : kind === 'list' ? (list?.offsetWidth ?? 400) : (list?.offsetHeight ?? 300))
  }
  const clamp = (v: number) => {
    const { min, max } = limits()
    return Math.round(Math.max(min, Math.min(max, v)))
  }
  const show = (v: number | null) => {
    const { app } = parts()
    if (!app) return
    if (v === null) app.style.removeProperty(VAR[kind])
    else app.style.setProperty(VAR[kind], `${v}px`)
  }

  const down = (e: RPointerEvent<HTMLDivElement>) => {
    const { folders, list } = parts()
    const start = kind === 'folders' ? folders?.getBoundingClientRect() : list?.getBoundingClientRect()
    if (!start) return
    e.preventDefault()
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    target.dataset.drag = '1'
    let last = current()
    const move = (ev: PointerEvent) => {
      last = clamp(vertical ? ev.clientX - start.left : ev.clientY - start.top)
      show(last)
    }
    const up = () => {
      delete target.dataset.drag
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      target.removeEventListener('pointercancel', up)
      onChange(last)
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
    target.addEventListener('pointercancel', up)
  }

  const key = (e: RKeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16
    const less = vertical ? 'ArrowLeft' : 'ArrowUp'
    const more = vertical ? 'ArrowRight' : 'ArrowDown'
    let v: number | null = null
    if (e.key === less) v = clamp(current() - step)
    else if (e.key === more) v = clamp(current() + step)
    else if (e.key === 'Home') v = limits().min
    else if (e.key === 'End') v = limits().max
    else if (e.key === 'Enter' || e.key === 'Escape') {
      if (e.key === 'Enter') {
        e.preventDefault()
        show(null)
        onChange(null)
      }
      return
    }
    if (v === null) return
    e.preventDefault()
    show(v)
    onChange(v)
  }

  const min = MIN[kind]
  const max = kind === 'folders' ? 380 : kind === 'list' ? 760 : 900
  return (
    <div
      ref={bar}
      className="splitter"
      data-kind={kind}
      role="separator"
      aria-orientation={vertical ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value ?? (kind === 'folders' ? 240 : kind === 'list' ? 400 : 300)}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={down}
      onKeyDown={key}
      onDoubleClick={() => {
        show(null)
        onChange(null)
      }}
    >
      <span className="splitter-grip" aria-hidden="true" />
    </div>
  )
}
