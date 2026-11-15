import { useEffect, useMemo } from 'react'
import type { Attachment } from '../types'
import { mockBlob, mockBytes, previewKind } from '../data/mockfile'
import { formatSize } from '../util'
import { FileIcon } from './FileIcon'
import { Icon } from './Icon'

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
  const url = useMemo(() => (a ? URL.createObjectURL(mockBlob(a)) : ''), [a])
  const text = useMemo(() => (a && kind === 'text' ? new TextDecoder().decode(mockBytes(a)) : ''), [a, kind])

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

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal preview" role="dialog" aria-modal="true" aria-label={`Preview of ${a.name}`}>
        <header className="preview-head">
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
        </header>
        <div className="preview-body">
          {kind === 'pdf' && <iframe key={url} src={url} title={`Preview of ${a.name}`} className="preview-frame" />}
          {kind === 'image' && <img key={url} src={url} alt={a.name} className="preview-img" />}
          {kind === 'text' && <pre className="preview-text">{text}</pre>}
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
    </div>
  )
}
