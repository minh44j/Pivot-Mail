import { useEffect, useRef, useState } from 'react'
import { SIG_HTML, sanitizeHtml, signatureBody } from '../richtext'
import { Icon } from './Icon'

/** Pictures are shrunk before they are stored: a logo does not need to be 4000 pixels wide, and the signature lives in this browser's small storage. */
const MAX_PX = 600
const SHOW_PX = 220
const MAX_FILE = 8 * 1024 * 1024
const MAX_SIGNATURE = 900_000

async function pictureFrom(file: Blob): Promise<{ src: string; w: number; h: number } | null> {
  if (!/^image\/(png|jpe?g|gif|webp)$/i.test(file.type) || file.size > MAX_FILE) return null
  let bmp: ImageBitmap
  try {
    bmp = await createImageBitmap(file)
  } catch {
    return null
  }
  const scale = Math.min(1, MAX_PX / bmp.width)
  const w = Math.max(1, Math.round(bmp.width * scale))
  const h = Math.max(1, Math.round(bmp.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(bmp, 0, 0, w, h)
  bmp.close()
  // Keep transparency (logos) as PNG; photos as JPEG. If it is still big, fall back to JPEG on white.
  let src = canvas.toDataURL(/jpe?g/i.test(file.type) ? 'image/jpeg' : 'image/png', 0.85)
  if (src.length > 350_000) {
    ctx.globalCompositeOperation = 'destination-over'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, w, h)
    src = canvas.toDataURL('image/jpeg', 0.8)
  }
  return { src, w, h }
}

/**
 * One signature, with pictures. Paste a picture (or a whole signature from another program), drop one in,
 * or use "Add picture". Click a picture to make it smaller, larger or remove it.
 */
export function SignatureEditor(props: { label: string; value: string; onChange: (v: string) => void }) {
  const { label, value, onChange } = props
  const box = useRef<HTMLDivElement>(null)
  const file = useRef<HTMLInputElement>(null)
  const [empty, setEmpty] = useState(() => !value.trim())
  const [sel, setSel] = useState<HTMLImageElement | null>(null)
  const [note, setNote] = useState('')

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
      setNote('This signature is too large to keep. Use smaller or fewer pictures.')
      return
    }
    setNote('')
    if (next !== value) onChange(next)
  }

  const putHtml = (html: string) => {
    const el = box.current
    if (!el) return
    el.focus()
    if (!el.contains(window.getSelection()?.anchorNode ?? null)) {
      const r = document.createRange()
      r.selectNodeContents(el)
      r.collapse(false)
      const s = window.getSelection()
      s?.removeAllRanges()
      s?.addRange(r)
    }
    document.execCommand('insertHTML', false, html)
    save()
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
      const dw = Math.min(p.w, SHOW_PX)
      const dh = Math.round((p.h * dw) / p.w)
      putHtml(`<img src="${p.src}" width="${dw}" height="${dh}" alt="">`)
    }
    setNote(failed ? 'That picture could not be added. Use a PNG, JPG, GIF or WebP under 8 MB.' : '')
  }

  const resize = (factor: number) => {
    if (!sel) return
    const w = Number(sel.getAttribute('width')) || sel.naturalWidth || SHOW_PX
    const h = Number(sel.getAttribute('height')) || sel.naturalHeight || SHOW_PX
    const nw = Math.max(24, Math.min(MAX_PX, Math.round(w * factor)))
    sel.setAttribute('width', String(nw))
    sel.setAttribute('height', String(Math.max(1, Math.round((h * nw) / w))))
    save()
  }
  const removePicture = () => {
    sel?.remove()
    setSel(null)
    save()
  }
  const choose = (img: HTMLImageElement | null) => {
    sel?.classList.remove('sig-pic-on')
    img?.classList.add('sig-pic-on')
    setSel(img)
  }

  return (
    <div className="fld sig-fld sig-rich">
      <span>{label}</span>
      <div className="sig-tools" role="toolbar" aria-label={`Signature tools for ${label}`}>
        <button type="button" className="sig-tool" onClick={() => file.current?.click()}>
          <Icon name="clip" size={14} /> Add picture
        </button>
        {sel && (
          <>
            <button type="button" className="sig-tool" onClick={() => resize(0.8)} aria-label="Make the picture smaller">
              Smaller
            </button>
            <button type="button" className="sig-tool" onClick={() => resize(1.25)} aria-label="Make the picture larger">
              Larger
            </button>
            <button type="button" className="sig-tool danger" onClick={removePicture} aria-label="Remove the picture">
              Remove
            </button>
          </>
        )}
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
      <div
        ref={box}
        className={`sig-editor${empty ? ' is-empty' : ''}`}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={`Signature for ${label}`}
        data-placeholder="Type your signature, or paste a picture here"
        onInput={save}
        onBlur={save}
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
      {note && (
        <small className="sig-note" role="alert">
          {note}
        </small>
      )}
    </div>
  )
}
