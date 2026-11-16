import { useEffect, useRef, useState } from 'react'
import { Icon } from './Icon'

export type FolderDialogState =
  | { mode: 'new'; accountId: string }
  | { mode: 'rename'; accountId: string; name: string }
  | { mode: 'delete'; accountId: string; name: string }

const RESERVED = ['inbox', 'archive', 'drafts', 'sent', 'deleted items', 'deleted', 'cases']

interface Props {
  state: FolderDialogState
  accountName: string
  existing: string[]
  count: number
  onSubmit: (name: string) => void
  onClose: () => void
}

/** Create, rename and delete confirmation for custom folders. */
export function FolderDialog({ state, accountName, existing, count, onSubmit, onClose }: Props) {
  const [value, setValue] = useState(state.mode === 'rename' ? state.name : '')
  const [error, setError] = useState('')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const submit = () => {
    if (state.mode === 'delete') return onSubmit(state.name)
    const v = value.trim().replace(/\s+/g, ' ')
    const others = existing.filter((x) => state.mode !== 'rename' || x !== state.name)
    if (!v) return setError('Enter a folder name')
    if (v.length > 40) return setError('Use 40 characters or fewer')
    if (/[,\\/]/.test(v)) return setError('Names cannot contain , / or \\')
    if (RESERVED.includes(v.toLowerCase()) || others.some((x) => x.toLowerCase() === v.toLowerCase())) return setError('A folder with this name already exists')
    onSubmit(v)
  }

  const title = state.mode === 'new' ? 'New folder' : state.mode === 'rename' ? 'Rename folder' : 'Delete folder'
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="fd-title"
        onSubmit={(e) => {
          e.preventDefault()
          submit()
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <div className="modal-head">
          <h2 id="fd-title">{title}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="modal-body">
          {state.mode === 'delete' ? (
            <p>
              Delete <strong>{state.name}</strong> from {accountName}? No mail is deleted. The label is removed from {count} message{count === 1 ? '' : 's'}, and they stay where they are (Inbox, Sent, Archive).
            </p>
          ) : (
            <label className="fld">
              <span>Name in {accountName}</span>
              <input ref={input} value={value} onChange={(e) => (setValue(e.target.value), setError(''))} aria-invalid={Boolean(error)} autoComplete="off" maxLength={60} />
              {error && <em className="err">{error}</em>}
            </label>
          )}
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={`btn primary${state.mode === 'delete' ? ' danger' : ''}`} autoFocus={state.mode === 'delete'}>
              {state.mode === 'new' ? 'Create' : state.mode === 'rename' ? 'Rename' : 'Delete folder'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
