import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import type { Attachment } from '../types'
import { formatSize } from '../util'
import { platform } from '../platform'
import { Icon } from './Icon'

interface Props {
  attachments: Attachment[]
  onToast: (msg: string) => void
  onForwardWith: (files: Attachment[]) => void
}

interface Menu {
  x: number
  y: number
}

/**
 * Attachments shown above the message body (Outlook style).
 * - Click, Ctrl/Cmd+click, Shift+click and drag-marquee selection
 * - Ctrl/Cmd+C copies selected file names (browser cannot put arbitrary files on the clipboard)
 * - Drag a chip out (Chromium: saves the file), right-click for actions
 */
export function AttachmentBar({ attachments, onToast, onForwardWith }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<Menu | null>(null)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const anchor = useRef<number>(-1)

  const [seen, setSeen] = useState(attachments)
  if (seen !== attachments) {
    setSeen(attachments)
    setSelected(new Set())
    setMenu(null)
  }

  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('pointerdown', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  const chosen = (): Attachment[] => attachments.filter((a) => selected.has(a.id))

  const copyNames = async (files: Attachment[]) => {
    const ok = await platform.copyText(files.map((f) => f.name).join('\n'))
    onToast(ok ? `Copied ${files.length} file name${files.length === 1 ? '' : 's'}` : 'Copy was blocked by the browser')
  }

  const save = (files: Attachment[]) => {
    for (const f of files) {
      const a = document.createElement('a')
      a.href = platform.fileUrl(f.name, `Mock content of ${f.name}`, f.mime)
      a.download = f.name
      a.click()
    }
    onToast(`Saving ${files.length} file${files.length === 1 ? '' : 's'}`)
  }

  const clickChip = (e: React.MouseEvent, i: number, a: Attachment) => {
    e.stopPropagation()
    setMenu(null)
    const next = new Set(selected)
    if (e.shiftKey && anchor.current >= 0) {
      const [lo, hi] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]
      next.clear()
      for (let k = lo; k <= hi; k++) {
        const id = attachments[k]?.id
        if (id) next.add(id)
      }
    } else if (e.ctrlKey || e.metaKey) {
      if (next.has(a.id)) next.delete(a.id)
      else next.add(a.id)
      anchor.current = i
    } else {
      next.clear()
      next.add(a.id)
      anchor.current = i
    }
    setSelected(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
      e.preventDefault()
      setSelected(new Set(attachments.map((a) => a.id)))
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selected.size > 0) {
      e.preventDefault()
      void copyNames(chosen())
    }
  }

  const onDragStart = (e: React.DragEvent, a: Attachment) => {
    const files = selected.has(a.id) ? chosen() : [a]
    const first = files[0] ?? a
    // Chromium-only: lets the user drop the file onto the desktop/folder.
    e.dataTransfer.setData('DownloadURL', `${first.mime}:${first.name}:${platform.fileUrl(first.name, `Mock content of ${first.name}`, first.mime)}`)
    e.dataTransfer.setData('text/plain', files.map((f) => f.name).join('\n'))
    e.dataTransfer.effectAllowed = 'copy'
  }

  // Marquee selection on empty space.
  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.button !== 0) return
    const box = e.currentTarget.getBoundingClientRect()
    setSelected(new Set())
    setMarquee({ x1: e.clientX - box.left, y1: e.clientY - box.top, x2: e.clientX - box.left, y2: e.clientY - box.top })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!marquee || !wrap.current) return
    const box = wrap.current.getBoundingClientRect()
    const next = { ...marquee, x2: e.clientX - box.left, y2: e.clientY - box.top }
    setMarquee(next)
    const [x1, x2] = [Math.min(next.x1, next.x2), Math.max(next.x1, next.x2)]
    const [y1, y2] = [Math.min(next.y1, next.y2), Math.max(next.y1, next.y2)]
    const hit = new Set<string>()
    wrap.current.querySelectorAll<HTMLElement>('[data-att]').forEach((el) => {
      const r = el.getBoundingClientRect()
      const [l, t, rr, b] = [r.left - box.left, r.top - box.top, r.right - box.left, r.bottom - box.top]
      if (l < x2 && rr > x1 && t < y2 && b > y1 && el.dataset.att) hit.add(el.dataset.att)
    })
    setSelected(hit)
  }
  const onPointerUp = () => setMarquee(null)

  if (attachments.length === 0) return null

  const files = chosen()
  return (
    <div
      className="attbar"
      tabIndex={0}
      onKeyDown={onKeyDown}
      aria-label={`${attachments.length} attachments`}
    >
      <div className="attbar-head">
        <Icon name="clip" size={14} /> {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
        {files.length > 0 && <span className="muted"> · {files.length} selected</span>}
        <span className="grow" />
        <button type="button" className="link" onClick={() => save(attachments)}>
          Save all
        </button>
      </div>
      <div className="chips" ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {attachments.map((a, i) => (
          <button
            key={a.id}
            type="button"
            data-att={a.id}
            className={`chip${selected.has(a.id) ? ' sel' : ''}`}
            draggable
            onDragStart={(e) => onDragStart(e, a)}
            onClick={(e) => clickChip(e, i, a)}
            onDoubleClick={() => save([a])}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!selected.has(a.id)) setSelected(new Set([a.id]))
              setMenu({ x: e.clientX, y: e.clientY })
            }}
          >
            <span className="chip-ext">{(a.name.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()}</span>
            <span className="chip-name">{a.name}</span>
            <span className="chip-size">{formatSize(a.size)}</span>
          </button>
        ))}
        {marquee && (
          <div
            className="marquee"
            style={{
              left: Math.min(marquee.x1, marquee.x2),
              top: Math.min(marquee.y1, marquee.y2),
              width: Math.abs(marquee.x2 - marquee.x1),
              height: Math.abs(marquee.y2 - marquee.y1),
            }}
          />
        )}
      </div>
      {menu && (
        <div
          className="ctx"
          role="menu"
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 220) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => { save(files); setMenu(null) }}>
            Save {files.length > 1 ? `${files.length} files` : ''}
          </button>
          <button type="button" role="menuitem" onClick={() => { void copyNames(files); setMenu(null) }}>
            Copy file name{files.length > 1 ? 's' : ''}
          </button>
          <button type="button" role="menuitem" onClick={() => { onForwardWith(files); setMenu(null) }}>
            Attach to new mail
          </button>
          <button type="button" role="menuitem" disabled title="Arrives in Phase 2 with Drive">
            Save to Drive (Phase 2)
          </button>
        </div>
      )}
    </div>
  )
}
