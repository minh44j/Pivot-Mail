import { useState } from 'react'
import { Icon } from './Icon'
import { addDays, at, fmtWhen, whenPresets } from '../when'
import type { WhenMode } from '../when'

const toLocalInput = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

interface Props {
  mode: WhenMode
  onPick: (iso: string | null) => void
  onClose: () => void
}

const TITLES: Record<WhenMode, string> = { snooze: 'Snooze until', followup: 'Follow up', send: 'Send later' }

/** One picker for snooze, follow-up due date and scheduled send. Times use this device's time zone. */
export function WhenDialog({ mode, onPick, onClose }: Props) {
  const [now] = useState(() => new Date())
  const [custom, setCustom] = useState(() => toLocalInput(at(addDays(now, 1), 8)))
  const [error, setError] = useState('')
  const presets = whenPresets(now, mode)

  const pickCustom = () => {
    const d = new Date(custom)
    if (Number.isNaN(d.getTime())) return setError('Choose a date and time')
    if (d.getTime() <= Date.now()) return setError('Choose a time in the future')
    onPick(d.toISOString())
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className="modal small"
        role="dialog"
        aria-modal="true"
        aria-labelledby="when-title"
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <header className="modal-head">
          <h2 id="when-title">{TITLES[mode]}</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </header>
        <div className="modal-body">
          <ul className="when-list">
            {presets.map((p, i) => (
              <li key={p.key}>
                <button type="button" className="when-item" autoFocus={i === 0} onClick={() => onPick(p.at.toISOString())}>
                  <Icon name="clock" size={16} tone="orange" />
                  <span className="grow">{p.label}</span>
                  <small>{fmtWhen(p.at.toISOString())}</small>
                </button>
              </li>
            ))}
            {mode === 'followup' && (
              <li>
                <button type="button" className="when-item" onClick={() => onPick(null)}>
                  <Icon name="flag" size={16} tone="orange" />
                  <span className="grow">No date</span>
                  <small>Flag only</small>
                </button>
              </li>
            )}
          </ul>
          <label className="fld">
            <span>Pick a date and time</span>
            <input type="datetime-local" value={custom} min={toLocalInput(now)} onChange={(e) => (setCustom(e.target.value), setError(''))} aria-invalid={Boolean(error)} />
            {error && <em className="err">{error}</em>}
          </label>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn primary" onClick={pickCustom}>
              {mode === 'send' ? 'Schedule send' : mode === 'snooze' ? 'Snooze' : 'Set date'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
