import { Icon } from './Icon'

interface Props {
  title: string
  children: React.ReactNode
  confirm: string
  danger?: boolean
  onConfirm: () => void
  onClose: () => void
}

/** Small confirmation for actions that cannot be undone. The destructive button takes focus only when it is the safe default to press. */
export function ConfirmDialog({ title, children, confirm, danger, onConfirm, onClose }: Props) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal small"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="cf-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="modal-head">
          <h2 id="cf-title">{title}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          <p>{children}</p>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} autoFocus>
              Cancel
            </button>
            <button type="button" className={`btn primary${danger ? ' danger' : ''}`} onClick={onConfirm}>
              {confirm}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
