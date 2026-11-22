import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Attachment } from '../types'
import { ensureBytes, isReady, mockBytes, previewKind } from '../data/mockfile'
import { formatSize } from '../util'
import { FileIcon } from './FileIcon'
import { Icon } from './Icon'
import { PdfPages } from './PdfPages'

/** The browser's own PDF viewer is missing in the Windows and Mac apps (Electron leaves it off): pages are drawn instead. */
const nativePdf = (): boolean => typeof navigator === 'undefined' || (navigator as Navigator & { pdfViewerEnabled?: boolean }).pdfViewerEnabled !== false

interface Props {
  files: Attachment[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onDownload: (a: Attachment) => void
  onCopy: (a: Attachment) => void
}

/** Full-size preview of an attachment. Left and right arrows move between the message's attachments. */
export function AttachmentPreview({ files, index, onIndex, onClose, onDownload, onCopy }: Props) {
  const a = files[index]
  const kind = a ? previewKind(a) : 'none'
  // Real attachments are fetched from Gmail first; `ready` re-renders once the bytes are here.
  const [ready, setReady] = useState(0)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!a || isReady(a)) return
    let live = true
    ensureBytes(a).then(
      () => live && setReady((n) => n + 1),
      () => live && setFailed(true),
    )
    return () => {
      live = false
    }
  }, [a])
  const have = ready >= 0 && a ? isReady(a) : false
  // The file's real kind, also when its type is unknown (often for files attached from the computer): a PDF must be shown
  // as a PDF, not offered as a download.
  const url = useMemo(() => {
    if (!a || !have) return ''
    const ext = (/\.([a-z0-9]+)$/i.exec(a.name)?.[1] ?? '').toLowerCase()
    const type = kind === 'pdf' ? 'application/pdf' : kind === 'image' ? (a.mime.startsWith('image/') ? a.mime : `image/${ext === 'jpg' ? 'jpeg' : ext}`) : a.mime
    return URL.createObjectURL(new Blob([mockBytes(a) as BlobPart], { type }))
  }, [a, have, kind])
  const text = useMemo(() => (a && kind === 'text' && have ? new TextDecoder().decode(mockBytes(a)) : ''), [a, kind, have])
  const drawn = kind === 'pdf' && !nativePdf()
  const pdfBytes = useMemo(() => (a && drawn && have ? mockBytes(a) : null), [a, drawn, have])
  const [drawFailedId, setDrawFailedId] = useState('')
  const drawFailed = !!a && drawFailedId === a.id
  const failId = a?.id ?? ''
  const onDrawFail = useCallback(() => setDrawFailedId(failId), [failId])

  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url)
    },
    [url],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowRight' && index < files.length - 1) {
        e.preventDefault()
        onIndex(index + 1)
      } else if (e.key === 'ArrowLeft' && index > 0) {
        e.preventDefault()
        onIndex(index - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, files.length, onIndex, onClose])

  if (!a) return null
  const ext = (a.name.split('.').pop() ?? 'file').toUpperCase()

  // On top of everything (the composer and the reading pane can otherwise trap it under other content).
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal preview" role="dialog" aria-modal="true" aria-label={`Preview of ${a.name}`}>
        <div className="preview-head">
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={() => onIndex(index - 1)} disabled={index === 0} aria-label="Previous attachment">
            <Icon name="back" />
          </button>
          <FileIcon name={a.name} mime={a.mime} size={24} />
          <div className="grow">
            <strong className="ellipsis block">{a.name}</strong>
            <small>
              {formatSize(a.size)} · {index + 1} of {files.length}
            </small>
          </div>
          <button type="button" className="btn" onClick={() => onCopy(a)}>
            <Icon name="copy" size={16} /> Copy
          </button>
          <button type="button" className="btn primary" onClick={() => onDownload(a)}>
            <Icon name="download" size={16} /> Download
          </button>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={() => onIndex(index + 1)} disabled={index >= files.length - 1} aria-label="Next attachment">
            <span style={{ display: 'inline-flex', transform: 'scaleX(-1)' }}>
              <Icon name="back" />
            </span>
          </button>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close preview">
            <Icon name="close" />
          </button>
        </div>
        <div className="preview-body">
          {!url && kind !== 'none' && (
            <div className="preview-none">
              <p className="muted" role="status">
                {failed ? (a.file ? 'Could not open this file. Try Download.' : 'Could not fetch this file from Gmail. Try Download.') : 'Loading…'}
              </p>
            </div>
          )}
          {url && kind === 'pdf' && !drawn && <iframe key={url} src={url} title={`Preview of ${a.name}`} className="preview-frame" />}
          {pdfBytes && !drawFailed && <PdfPages key={a.id} bytes={pdfBytes} name={a.name} onFail={onDrawFail} />}
          {drawn && drawFailed && (
            <div className="preview-none">
              <p className="muted" role="status">
                Could not show this PDF. Try Download.
              </p>
            </div>
          )}
          {url && kind === 'image' && <img key={url} src={url} alt={a.name} className="preview-img" />}
          {url && kind === 'text' && <pre className="preview-text">{text}</pre>}
          {kind === 'none' && (
            <div className="preview-none">
              <FileIcon name={a.name} mime={a.mime} size={64} />
              <p>
                <strong>No preview for {ext} files</strong>
              </p>
              <p className="muted">Download the file to open it in its own app.</p>
              <button type="button" className="btn primary" onClick={() => onDownload(a)}>
                <Icon name="download" size={16} /> Download
              </button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
