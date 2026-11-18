import { useEffect, useRef, useState } from 'react'
import type { PointerEvent as RPointerEvent, ReactNode } from 'react'
import { SIG_HTML, safeUrl, sanitizeHtml, signatureBody } from '../richtext'
import { Icon } from './Icon'

/** Same fonts and sizes an Outlook signature offers (sizes in points). */
const FONTS = ['Calibri', 'Arial', 'Times New Roman', 'Georgia', 'Verdana', 'Tahoma', 'Trebuchet MS', 'Courier New']
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28]
const MAX_FILE = 8 * 1024 * 1024
/** The signature is kept in this browser's small storage, so there is a ceiling (about 3 MB of text). */
const MAX_SIGNATURE = 3_000_000

/** A picture exactly as it was pasted: the original bytes, the original pixel size. Nothing is shrunk or re-saved. */
function pictureFrom(file: Blob): Promise<{ src: string; w: number; h: number } | null> {
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type) || file.size > MAX_FILE) return Promise.resolve(null)
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onerror = () => resolve(null)
    reader.onload = () => {
      const src = String(reader.result)
      const img = new Image()
      img.onload = () => resolve({ src, w: img.naturalWidth, h: img.naturalHeight })
      img.onerror = () => resolve(null)
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

function Tool(props: { label: string; onClick: () => void; children: ReactNode; on?: boolean }) {
  return (
    <button type="button" className={`sig-tool icon${props.on ? ' on' : ''}`} title={props.label} aria-label={props.label} onMouseDown={(e) => e.preventDefault()} onClick={props.onClick}>
      {props.children}
    </button>
  )
}

/**
 * One signature, edited like Outlook's: font, size, bold / italic / underline, colour, alignment, lists, link and pictures.
 * A picture goes in at its real size; drag its corner to resize it (the shape is kept), press Delete to remove it.
 */
export function SignatureEditor(props: { label: string; value: string; onChange: (v: string) => void }) {
  const { label, value, onChange } = props
  const wrap = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const saved = useRef<Range | null>(null)
  const [empty, setEmpty] = useState(() => !value.trim())
  const [sel, setSel] = useState<HTMLImageElement | null>(null)
  const [handle, setHandle] = useState<{ x: number; y: number } | null>(null)
  const [note, setNote] = useState('')
  const [linkOpen, setLinkOpen] = useState(false)
  const [link, setLink] = useState('')
  const [color, setColor] = useState('#1d1d1f')

  // Fill the editor once. After that the editor owns its content (re-filling would move the caret).
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.innerHTML = signatureBody(value)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const save = () => {
    const el = box.current
    if (!el) return
    const clean = sanitizeHtml(el.innerHTML, { images: true })
    const has = /<img\b/i.test(clean) || (new DOMParser().parseFromString(`<body>${clean}</body>`, 'text/html').body.textContent ?? '').trim() !== ''
    setEmpty(!has)
    const next = has ? SIG_HTML + clean : ''
    if (next.length > MAX_SIGNATURE) {
      setNote('This signature is too large to keep in this browser. Use a smaller picture.')
      return
    }
    setNote('')
    if (next !== value) onChange(next)
  }

  /** Where the resize handle sits: the bottom-right corner of the chosen picture. */
  const place = (img: HTMLImageElement | null) => {
    const w = wrap.current
    if (!img || !w || !img.isConnected) return setHandle(null)
    const a = img.getBoundingClientRect()
    const b = w.getBoundingClientRect()
    setHandle({ x: a.right - b.left, y: a.bottom - b.top })
  }
  const choose = (img: HTMLImageElement | null) => {
    sel?.classList.remove('sig-pic-on')
    img?.classList.add('sig-pic-on')
    setSel(img)
    place(img)
    if (img) {
      const r = document.createRange()
      r.selectNode(img)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
    }
  }
  useEffect(() => {
    if (!sel) return
    const again = () => place(sel)
    window.addEventListener('resize', again)
    return () => window.removeEventListener('resize', again)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel])

  const focusEditor = () => {
    const el = box.current
    if (!el) return
    el.focus()
    const s = window.getSelection()
    if (saved.current && el.contains(saved.current.commonAncestorContainer)) {
      s?.removeAllRanges()
      s?.addRange(saved.current)
    } else if (!el.contains(s?.anchorNode ?? null)) {
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      s?.removeAllRanges()
      s?.addRange(r)
    }
  }
  const remember = () => {
    const s = window.getSelection()
    if (s && s.rangeCount > 0 && box.current?.contains(s.anchorNode)) saved.current = s.getRangeAt(0).cloneRange()
  }

  const run = (cmd: string, arg?: string) => {
    focusEditor()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand(cmd, false, arg)
    save()
    remember()
  }
  /** Font size in points: the browser only knows seven sizes, so use its largest as a marker and replace it with the chosen one. */
  const setSize = (pt: number) => {
    focusEditor()
    document.execCommand('styleWithCSS', false, 'true')
    document.execCommand('fontSize', false, '7')
    box.current?.querySelectorAll<HTMLElement>('font[size="7"], span[style*="xxx-large"]').forEach((n) => {
      n.removeAttribute('size')
      n.style.fontSize = `${pt}pt`
    })
    save()
    remember()
  }

  const putHtml = (html: string) => {
    focusEditor()
    document.execCommand('insertHTML', false, html)
    save()
    remember()
  }
  const addFiles = async (files: File[]) => {
    const pics = files.filter((f) => f.type.startsWith('image/'))
    if (pics.length === 0) return
    let failed = 0
    for (const f of pics) {
      const p = await pictureFrom(f)
      if (!p) {
        failed++
        continue
      }
      putHtml(`<img src="${p.src}" width="${p.w}" height="${p.h}" alt="">`)
    }
    setNote(failed ? 'That picture could not be added. Use a PNG, JPG, GIF or WebP under 8 MB.' : '')
  }

  const applyLink = () => {
    const href = safeUrl(link)
    setLinkOpen(false)
    setLink('')
    if (!href) return
    focusEditor()
    // Something is selected (text or a picture): the link goes around it. Nothing selected: the address itself is inserted.
    const s = window.getSelection()
    const something = Boolean(s && s.rangeCount > 0 && !s.getRangeAt(0).collapsed)
    if (something) document.execCommand('createLink', false, href)
    else document.execCommand('insertHTML', false, `<a href="${href.replace(/"/g, '&quot;')}">${href.replace(/</g, '&lt;')}</a>`)
    save()
    remember()
  }

  /** Dragging the corner handle: the picture keeps its shape. */
  const drag = (e: RPointerEvent<HTMLButtonElement>) => {
    if (!sel) return
    e.preventDefault()
    const img = sel
    const startX = e.clientX
    const w0 = img.getBoundingClientRect().width
    const ratio = (Number(img.getAttribute('height')) || img.naturalHeight || 1) / (Number(img.getAttribute('width')) || img.naturalWidth || 1)
    const target = e.currentTarget
    target.setPointerCapture(e.pointerId)
    const move = (ev: PointerEvent) => {
      const nw = Math.max(16, Math.min(2000, Math.round(w0 + (ev.clientX - startX))))
      img.setAttribute('width', String(nw))
      img.setAttribute('height', String(Math.max(1, Math.round(nw * ratio))))
      place(img)
    }
    const up = () => {
      target.removeEventListener('pointermove', move)
      target.removeEventListener('pointerup', up)
      save()
    }
    target.addEventListener('pointermove', move)
    target.addEventListener('pointerup', up)
  }

  return (
    <div className="fld sig-fld sig-rich">
      <span>{label}</span>
      <div className="sig-tools" role="toolbar" aria-label={`Signature tools for ${label}`}>
        <select className="sig-sel" aria-label="Font" defaultValue="" onChange={(e) => e.target.value && run('fontName', e.target.value)} onMouseDown={remember}>
          <option value="" disabled>
            Font
          </option>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        <select className="sig-sel narrow" aria-label="Font size" defaultValue="" onChange={(e) => e.target.value && setSize(Number(e.target.value))} onMouseDown={remember}>
          <option value="" disabled>
            Size
          </option>
          {SIZES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <span className="sig-sep" aria-hidden="true" />
        <Tool label="Bold" onClick={() => run('bold')}>
          <b>B</b>
        </Tool>
        <Tool label="Italic" onClick={() => run('italic')}>
          <i>I</i>
        </Tool>
        <Tool label="Underline" onClick={() => run('underline')}>
          <u>U</u>
        </Tool>
        <label className="sig-tool icon sig-color" title="Text colour" onMouseDown={remember}>
          <span className="sig-color-a" style={{ borderBottomColor: color }}>
            A
          </span>
          <input
            type="color"
            aria-label="Text colour"
            value={color}
            onChange={(e) => {
              setColor(e.target.value)
              run('foreColor', e.target.value)
            }}
          />
        </label>
        <span className="sig-sep" aria-hidden="true" />
        <Tool label="Align left" onClick={() => run('justifyLeft')}>
          <Icon name="alignLeft" size={15} />
        </Tool>
        <Tool label="Centre" onClick={() => run('justifyCenter')}>
          <Icon name="alignCenter" size={15} />
        </Tool>
        <Tool label="Align right" onClick={() => run('justifyRight')}>
          <Icon name="alignRight" size={15} />
        </Tool>
        <Tool label="Bulleted list" onClick={() => run('insertUnorderedList')}>
          <Icon name="listBullet" size={15} />
        </Tool>
        <Tool label="Numbered list" onClick={() => run('insertOrderedList')}>
          <Icon name="listNumber" size={15} />
        </Tool>
        <span className="sig-sep" aria-hidden="true" />
        <Tool
          label="Insert link"
          onClick={() => {
            remember()
            setLinkOpen((o) => !o)
          }}
          on={linkOpen}
        >
          <Icon name="link" size={15} />
        </Tool>
        <Tool label="Insert picture" onClick={() => file.current?.click()}>
          <Icon name="clip" size={15} />
        </Tool>
        <Tool label="Clear formatting" onClick={() => run('removeFormat')}>
          <Icon name="clearFormat" size={15} />
        </Tool>
        <input
          ref={file}
          type="file"
          accept="image/png,image/jpeg,image/gif,image/webp"
          multiple
          hidden
          onChange={(e) => {
            void addFiles(Array.from(e.target.files ?? []))
            e.target.value = ''
          }}
        />
      </div>
      {linkOpen && (
        <form
          className="sig-link"
          onSubmit={(e) => {
            e.preventDefault()
            applyLink()
          }}
        >
          <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Web address, for example pivotscl.com" aria-label="Link address" autoFocus />
          <button type="submit" className="sig-tool">
            Add link
          </button>
        </form>
      )}
      <div className="sig-stage" ref={wrap}>
        <div
          ref={box}
          className={`sig-editor${empty ? ' is-empty' : ''}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={`Signature for ${label}`}
          data-placeholder="Type your signature, or paste a picture here"
          onInput={() => {
            save()
            if (sel && !sel.isConnected) {
              setSel(null)
              setHandle(null)
            } else place(sel)
          }}
          onBlur={save}
          onKeyUp={remember}
          onMouseUp={remember}
          onClick={(e) => choose(e.target instanceof HTMLImageElement ? e.target : null)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'))
            e.preventDefault()
            if (files.length > 0) {
              void addFiles(files)
              return
            }
            const html = e.clipboardData.getData('text/html')
            if (html) putHtml(sanitizeHtml(html, { images: true }))
            else document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
            save()
          }}
          onDragOver={(e) => {
            if (Array.from(e.dataTransfer.types).includes('Files')) e.preventDefault()
          }}
          onDrop={(e) => {
            const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'))
            if (files.length === 0) return
            e.preventDefault()
            void addFiles(files)
          }}
        />
        {sel && handle && <button type="button" className="sig-handle" style={{ left: handle.x - 6, top: handle.y - 6 }} aria-label="Drag to resize the picture" onPointerDown={drag} />}
      </div>
      {note && (
        <small className="sig-note" role="alert">
          {note}
        </small>
      )}
    </div>
  )
}
