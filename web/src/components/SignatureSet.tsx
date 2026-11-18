import { useState } from 'react'
import type { Account, Signature } from '../types'
import { Icon } from './Icon'
import { SignatureEditor } from './SignatureEditor'

const newId = () => `sig-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

/** One mailbox's signatures: pick one to edit, add or delete, and choose the defaults for new messages and for replies. */
export function SignatureSet(props: { account: Account; onChange: (list: Signature[], newId: string, replyId: string) => void }) {
  const { account: a, onChange } = props
  const list = a.signatures ?? []
  const [openId, setOpenId] = useState<string>(list[0]?.id ?? '')
  const [confirm, setConfirm] = useState(false)
  const open = list.find((g) => g.id === openId) ?? list[0]
  const newDefault = a.sigNew ?? ''
  const replyDefault = a.sigReply ?? ''

  const save = (next: Signature[], n = newDefault, r = replyDefault) => {
    // A default that no longer exists falls back to none.
    onChange(next, next.some((g) => g.id === n) ? n : '', next.some((g) => g.id === r) ? r : '')
  }
  const add = () => {
    const names = new Set(list.map((g) => g.name))
    let i = list.length + 1
    while (names.has(`Signature ${i}`)) i++
    const g: Signature = { id: newId(), name: `Signature ${i}`, body: '' }
    // The first signature of a mailbox becomes the default for both kinds of message.
    save([...list, g], list.length === 0 ? g.id : newDefault, list.length === 0 ? g.id : replyDefault)
    setOpenId(g.id)
    setConfirm(false)
  }
  const remove = () => {
    if (!open) return
    const next = list.filter((g) => g.id !== open.id)
    save(next)
    setOpenId(next[0]?.id ?? '')
    setConfirm(false)
  }

  return (
    <div className="sigset">
      <h3 className="sigset-head">
        {a.name} <small>{a.email}</small>
      </h3>
      <div className="sigset-tabs">
        {list.length > 0 && (
          <div className="sigset-tablist" role="tablist" aria-label={`Signatures of ${a.email}`}>
            {list.map((g) => (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={open?.id === g.id}
                className={`sigset-tab${open?.id === g.id ? ' on' : ''}`}
                onClick={() => {
                  setOpenId(g.id)
                  setConfirm(false)
                }}
              >
                {g.name || 'Untitled'}
                {(g.id === newDefault || g.id === replyDefault) && <span className="sigset-dot" title="Used by default" aria-hidden="true" />}
              </button>
            ))}
          </div>
        )}
        <button type="button" className="sigset-add" onClick={add}>
          <Icon name="plus" size={14} /> New signature
        </button>
      </div>

      {open ? (
        <div className="sigset-body" key={open.id}>
          <div className="sigset-name">
            <label className="fld">
              <span>Name</span>
              <input
                className="input"
                value={open.name}
                maxLength={40}
                onChange={(e) => save(list.map((g) => (g.id === open.id ? { ...g, name: e.target.value } : g)))}
                aria-label={`Name of this signature for ${a.email}`}
              />
            </label>
            {confirm ? (
              <span className="sigset-confirm" role="alert">
                Delete “{open.name || 'Untitled'}”?
                <button type="button" className="sig-tool danger" onClick={remove}>
                  Delete
                </button>
                <button type="button" className="sig-tool" onClick={() => setConfirm(false)}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="sig-tool danger" onClick={() => setConfirm(true)}>
                Delete signature
              </button>
            )}
          </div>
          <SignatureEditor label={`${open.name || 'Untitled'} · ${a.email}`} value={open.body} onChange={(v) => save(list.map((g) => (g.id === open.id ? { ...g, body: v } : g)))} />
        </div>
      ) : (
        <p className="muted">No signature yet. Press “New signature” to write one.</p>
      )}

      {list.length > 0 && (
        <div className="sigset-defaults">
          <label className="fld">
            <span>For new messages</span>
            <select className="input" value={newDefault} onChange={(e) => save(list, e.target.value, replyDefault)} aria-label={`Signature for new messages from ${a.email}`}>
              <option value="">No signature</option>
              {list.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
          <label className="fld">
            <span>For replies and forwards</span>
            <select className="input" value={replyDefault} onChange={(e) => save(list, newDefault, e.target.value)} aria-label={`Signature for replies and forwards from ${a.email}`}>
              <option value="">No signature</option>
              {list.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name || 'Untitled'}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  )
}
