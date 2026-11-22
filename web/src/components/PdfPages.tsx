import { useEffect, useRef, useState } from 'react'

/** Pages drawn at most (a longer file says so and offers Download). */
const MAX_PAGES = 40

/**
 * A PDF drawn page by page with pdf.js, for windows without the browser's own PDF viewer. The Windows and Mac apps had it
 * switched off (2026-11-22: a PDF preview showed only a "download" placeholder there). pdf.js is loaded only when needed.
 */
export function PdfPages({ bytes, name, onFail }: { bytes: Uint8Array; name: string; onFail: () => void }) {
  const outer = useRef<HTMLDivElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const [pages, setPages] = useState(0)
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let live = true
    let cleanup: (() => void) | undefined
    const sheets = box.current
    void (async () => {
      try {
        const pdfjs = await import('pdfjs-dist')
        const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url')
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default
        // A copy: pdf.js hands the bytes to its worker, which would empty the attachment's own copy.
        const task = pdfjs.getDocument({ data: bytes.slice() })
        cleanup = () => void task.destroy()
        const doc = await task.promise
        if (!live) return
        setTotal(doc.numPages)
        // The preview's own width (the sheets hold nothing yet to measure), less its padding; never wider than a page needs.
        const width = Math.min(1100, Math.max(320, (outer.current?.clientWidth ?? 800) - 40))
        const scale = window.devicePixelRatio || 1
        for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES) && live; n++) {
          const page = await doc.getPage(n)
          const base = page.getViewport({ scale: 1 })
          const vp = page.getViewport({ scale: (width / base.width) * scale })
          const canvas = document.createElement('canvas')
          canvas.width = Math.floor(vp.width)
          canvas.height = Math.floor(vp.height)
          canvas.style.width = `${Math.floor(vp.width / scale)}px`
          canvas.className = 'pdf-page'
          canvas.setAttribute('role', 'img')
          canvas.setAttribute('aria-label', `${name}, page ${n}`)
          await page.render({ canvas, viewport: vp }).promise
          if (!live) return
          sheets?.appendChild(canvas)
          setPages(n)
        }
      } catch {
        if (live) onFail()
      }
    })()
    return () => {
      live = false
      cleanup?.()
      if (sheets) sheets.textContent = ''
    }
  }, [bytes, name, onFail])
  return (
    <div className="pdf-pages" ref={outer} aria-busy={pages === 0}>
      {pages === 0 && <p className="muted pdf-note">Loading…</p>}
      <div ref={box} className="pdf-sheets" />
      {total > MAX_PAGES && pages === MAX_PAGES && <p className="muted pdf-note">First {MAX_PAGES} of {total} pages. Download to see all.</p>}
    </div>
  )
}
