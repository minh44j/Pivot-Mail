import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent } from 'react'
import type { Attachment } from '../types'
import { formatSize } from '../util'
import { platform } from '../platform'
import { ensureBytes, isReady, mockBlob, mockBytes } from '../data/mockfile'
import { makeZip } from '../zip'
import { AttachmentPreview } from './AttachmentPreview'
import { FileIcon } from './FileIcon'
import { Icon } from './Icon'

interface Props {
  attachments: Attachment[]
  /** Used to name the "Download all" archive */
  zipName?: string
  onToast: (msg: string) => void
  onForwardWith: (files: Attachment[]) => void
}

interface Menu {
  x: number
  y: number
}

/** Archive names stay plain ASCII: some browsers drop the whole name when it contains characters like × or –. */
const safeName = (s: string): string =>
  [...s.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/×/g, 'x').replace(/[–—]/g, '-').replace(/[\\/:*?"<>|]/g, '')]
    .filter((ch) => ch.charCodeAt(0) >= 32 && ch.charCodeAt(0) <= 126)
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60) || 'attachments'

/**
 * Attachments shown above the message body (Outlook style).
 * Each file has Preview, Copy and Download buttons; the header has Download all.
 * - Click, Ctrl/Cmd+click, Shift+click and drag-marquee selection
 * - Space or double-click previews, Ctrl/Cmd+C copies
 * - Drag a file out (Chromium: saves the file), right-click for the same actions
 */
export function AttachmentBar({ attachments, zipName, onToast, onForwardWith }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [menu, setMenu] = useState<Menu | null>(null)
  const [preview, setPreview] = useState<number | null>(null)
  const [marquee, setMarquee] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const wrap = useRef<HTMLDivElement>(null)
  const anchor = useRef<number>(-1)

  const [seen, setSeen] = useState(attachments)
  if (seen !== attachments) {
    setSeen(attachments)
    setSelected(new Set())
    setMenu(null)
    setPreview(null)
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

  /** One file downloads as is; several download as a single zip. */
  const download = async (files: Attachment[], name?: string) => {
    const first = files[0]
    if (!first) return
    try {
      await Promise.all(files.map(ensureBytes))
    } catch {
      onToast('Could not fetch the attachment from Gmail. Please try again.')
      return
    }
    if (files.length === 1) {
      platform.saveBlob(mockBlob(first), first.name)
      onToast(`Downloaded ${first.name}`)
      return
    }
    const zip = makeZip(files.map((f) => ({ name: f.name, data: mockBytes(f) })))
    platform.saveBlob(zip, `${safeName(name ?? zipName ?? 'attachments')}.zip`)
    onToast(`Downloaded ${files.length} files as a zip`)
  }

  /** Copy the file itself when the browser allows it, otherwise the file name, and say which. */
  const copyFiles = async (files: Attachment[]) => {
    const first = files[0]
    if (!first) return
    if (files.length === 1) {
      try {
        await ensureBytes(first)
      } catch {
        onToast('Could not fetch the attachment from Gmail. Please try again.')
        return
      }
      const r = await platform.copyBlob(mockBlob(first))
      if (r === 'copied') {
        onToast(`Copied ${first.name}`)
        return
      }
      const ok = await platform.copyText(first.name)
      onToast(ok ? 'Copied the file name. Browsers cannot copy this file type, so use Download or drag it out.' : 'Copy was blocked by the browser')
      return
    }
    const ok = await platform.copyText(files.map((f) => f.name).join('\n'))
    onToast(ok ? `Copied ${files.length} file names. Browsers cannot copy several files at once.` : 'Copy was blocked by the browser')
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
      void copyFiles(chosen())
    }
  }

  const onDragStart = (e: React.DragEvent, a: Attachment) => {
    const files = selected.has(a.id) ? chosen() : [a]
    const first = files[0] ?? a
    // Chromium-only: lets the user drop the file onto the desktop or a folder.
    if (isReady(first)) {
      const url = URL.createObjectURL(mockBlob(first))
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000)
      e.dataTransfer.setData('DownloadURL', `${first.mime}:${first.name}:${url}`)
    }
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
    <div className="attbar" tabIndex={0} onKeyDown={onKeyDown} aria-label={`${attachments.length} attachments`}>
      <div className="attbar-head">
        <span className="sr-only">
          {attachments.length} attachment{attachments.length === 1 ? '' : 's'}
          {files.length > 0 ? `, ${files.length} selected` : ''}
        </span>
        {files.length > 0 && files.length < attachments.length && (
          <button type="button" className="att-btn" onClick={() => download(files)}>
            <Icon name="download" size={14} /> Download selected
          </button>
        )}
        <button type="button" className="att-btn" onClick={() => download(attachments)}>
          <Icon name="download" size={16} /> Download all ({attachments.length})
        </button>
      </div>
      <div className="chips" ref={wrap} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        {attachments.map((a, i) => (
          <div
            key={a.id}
            data-att={a.id}
            className={`att${selected.has(a.id) ? ' sel' : ''}`}
            role="group"
            aria-label={`${a.name}, ${formatSize(a.size)}`}
            tabIndex={0}
            draggable
            onDragStart={(e) => onDragStart(e, a)}
            onClick={(e) => clickChip(e, i, a)}
            onDoubleClick={() => setPreview(i)}
            onKeyDown={(e) => {
              if (e.target === e.currentTarget && (e.key === ' ' || e.key === 'Enter')) {
                e.preventDefault()
                setPreview(i)
              }
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => {
              e.preventDefault()
              e.stopPropagation()
              if (!selected.has(a.id)) setSelected(new Set([a.id]))
              setMenu({ x: e.clientX, y: e.clientY })
            }}
          >
            <FileIcon name={a.name} mime={a.mime} size={30} />
            <span className="att-meta">
              <span className="chip-name">{a.name}</span>
              <small>{formatSize(a.size)}</small>
            </span>
            <span className="att-actions" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                aria-label={`Actions for ${a.name}`}
                aria-haspopup="menu"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect()
                  setSelected(new Set([a.id]))
                  setMenu({ x: r.left, y: r.bottom + 4 })
                }}
              >
                <Icon name="chevron" size={14} />
              </button>
            </span>
          </div>
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
          style={{ left: Math.min(menu.x, window.innerWidth - 220), top: Math.min(menu.y, window.innerHeight - 240) }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const i = attachments.findIndex((a) => a.id === files[0]?.id)
              if (i >= 0) setPreview(i)
              setMenu(null)
            }}
          >
            Preview
          </button>
          <button type="button" role="menuitem" onClick={() => { download(files); setMenu(null) }}>
            Download{files.length > 1 ? ` ${files.length} files` : ''}
          </button>
          <button type="button" role="menuitem" onClick={() => { void copyFiles(files); setMenu(null) }}>
            Copy{files.length > 1 ? ' file names' : ''}
          </button>
          <button type="button" role="menuitem" onClick={() => { onForwardWith(files); setMenu(null) }}>
            Attach to new mail
          </button>
          <button type="button" role="menuitem" disabled>
            Save to Drive (Phase 2)
          </button>
        </div>
      )}
      {preview !== null && (
        <AttachmentPreview
          files={attachments}
          index={Math.min(preview, attachments.length - 1)}
          onIndex={(i) => setPreview(Math.max(0, Math.min(attachments.length - 1, i)))}
          onClose={() => setPreview(null)}
          onDownload={(a) => download([a])}
          onCopy={(a) => void copyFiles([a])}
        />
      )}
    </div>
  )
}
