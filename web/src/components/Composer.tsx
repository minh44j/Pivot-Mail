import { useEffect, useRef, useState } from 'react'
import type { Account, Attachment, ComposeInit } from '../types'
import { TEMPLATES, applyTemplate } from '../data/templates'
import type { Template } from '../data/templates'
import { platform } from '../platform'
import { formatSize } from '../util'
import { Icon } from './Icon'

interface Props {
  init: ComposeInit
  accounts: Account[]
  pendingTemplate: Template | null
  onTemplateUsed: () => void
  onSend: (d: ComposeInit) => void
  onClose: () => void
  onToast: (m: string) => void
}

const DRAFT_KEY = 'pm.draft'

function withSignature(body: string, signature: string): string {
  return body.includes(signature) ? body : `${body}\n\n-- \n${signature}`
}

export function Composer({ init, accounts, pendingTemplate, onTemplateUsed, onSend, onClose, onToast }: Props) {
  const [d, setD] = useState<ComposeInit>(() => ({
    ...init,
    body: init.body || withSignature('', accounts.find((a) => a.id === init.accountId)?.signature ?? ''),
  }))
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dragging, setDragging] = useState(false)
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null)
  const [expanded, setExpanded] = useState(false)
  const first = useRef(true)
  const bodyRef = useRef<HTMLTextAreaElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  // Restore an unsent draft once, only for blank new mail.
  useEffect(() => {
    if (init.to || init.subject || init.attachments.length > 0 || init.body) return
    const raw = platform.storage.get(DRAFT_KEY)
    if (!raw) return
    try {
      setD(JSON.parse(raw) as ComposeInit)
      onToast('Unsent draft restored')
    } catch {
      platform.storage.remove(DRAFT_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave 1.2 s after the last edit.
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    setSaved('saving')
    const t = window.setTimeout(() => {
      platform.storage.set(DRAFT_KEY, JSON.stringify(d))
      setSaved('saved')
    }, 1200)
    return () => window.clearTimeout(t)
  }, [d])

  useEffect(() => {
    if (!pendingTemplate) return
    const acc = accounts.find((a) => a.id === d.accountId)
    const filled = applyTemplate(pendingTemplate, {
      sender: acc?.signature.split('\n')[0] ?? '',
      subject: d.subject.replace(/^(re|fwd?):\s*/i, ''),
    })
    setD((prev) => ({
      ...prev,
      subject: prev.subject ? prev.subject : filled.subject,
      body: withSignature(filled.body.replace(/\n*Best regards,\n[^\n]*$/, '\n\nBest regards,'), acc?.signature ?? ''),
    }))
    onTemplateUsed()
    onToast(`Template inserted: ${pendingTemplate.name}. Fill the [bracketed] fields.`)
    bodyRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTemplate])

  const addFiles = (files: FileList | File[]) => {
    const added: Attachment[] = Array.from(files).map((f, i) => ({
      id: `n${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
    }))
    if (added.length === 0) return
    setD((prev) => ({ ...prev, attachments: [...prev.attachments, ...added] }))
  }

  const canSend = d.to.trim().length > 0

  const send = () => {
    if (!canSend) {
      onToast('Add at least one recipient')
      return
    }
    platform.storage.remove(DRAFT_KEY)
    onSend(d)
  }

  /** Expanded = same box as the reading pane (falls back to the list pane when the reader is hidden). */
  const measure = () => {
    const el = document.querySelector<HTMLElement>('.workspace > .reader') ?? document.querySelector<HTMLElement>('.workspace > .list')
    if (!el) return
    const r = el.getBoundingClientRect()
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height })
  }
  const toggleExpanded = () => {
    if (expanded) {
      setExpanded(false)
      setRect(null)
    } else {
      measure()
      setExpanded(true)
    }
  }
  useEffect(() => {
    if (!expanded) return
    const onResize = () => measure()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [expanded])

  const close = () => {
    onClose()
  }

  const discard = () => {
    platform.storage.remove(DRAFT_KEY)
    onClose()
    onToast('Draft discarded')
  }

  return (
    <div
      className={`composer${dragging ? ' drag' : ''}${expanded && rect ? ' expanded' : ''}`}
      style={expanded && rect ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height, right: 'auto', bottom: 'auto' } : undefined}
      role="dialog"
      aria-label="New message"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault()
          setDragging(true)
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        addFiles(e.dataTransfer.files)
      }}
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') send()
        if (e.key === 'Escape') close()
      }}
    >
      <header className="composer-head">
        <strong className="grow ellipsis">{d.subject || 'New message'}</strong>
        <span className="muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved' : ''}</span>
        <button type="button" className="icon-btn only-desktop" onClick={toggleExpanded} aria-label={expanded ? 'Restore size' : 'Expand to reading pane size'} title={expanded ? 'Restore size' : 'Expand to reading pane size'}>
          <Icon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close and keep draft" title="Close (draft is kept)">
          <Icon name="close" />
        </button>
      </header>
      <div className="composer-bar" role="toolbar" aria-label="Message actions">
        <button type="button" className="primary" onClick={send} disabled={!canSend} title="Send (Ctrl+Enter)">
          <Icon name="send" size={16} /> Send
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} title="Attach files">
          <Icon name="clip" size={16} /> Attach
        </button>
        <select
          aria-label="Insert template"
          value=""
          onChange={(e) => {
            const t = TEMPLATES.find((x) => x.id === e.target.value)
            if (!t) return
            const acc = accounts.find((a) => a.id === d.accountId)
            const filled = applyTemplate(t, { sender: acc?.signature.split('\n')[0] ?? '' })
            setD((prev) => ({ ...prev, subject: prev.subject || filled.subject, body: withSignature(filled.body, acc?.signature ?? '') }))
          }}
        >
          <option value="">Templates…</option>
          {TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.category} – {t.name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <small className="hint muted">Ctrl+Enter to send</small>
        <button type="button" onClick={discard} title="Discard draft" aria-label="Discard draft">
          <Icon name="trash" size={16} />
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <div className="composer-body">
        <label className="field">
          <span>From</span>
          <select value={d.accountId} onChange={(e) => setD({ ...d, accountId: e.target.value })}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} &lt;{a.email}&gt;
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>To</span>
          <input value={d.to} onChange={(e) => setD({ ...d, to: e.target.value })} inputMode="email" autoFocus={!d.to} />
        </label>
        <label className="field">
          <span>Cc</span>
          <input value={d.cc} onChange={(e) => setD({ ...d, cc: e.target.value })} inputMode="email" />
        </label>
        <label className="field">
          <span>Subject</span>
          <input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        </label>
        {d.attachments.length > 0 && (
          <div className="chips composer-chips">
            {d.attachments.map((a) => (
              <span key={a.id} className="chip">
                <span className="chip-ext">{(a.name.split('.').pop() ?? 'file').slice(0, 4).toUpperCase()}</span>
                <span className="chip-name">{a.name}</span>
                <span className="chip-size">{formatSize(a.size)}</span>
                <button type="button" className="chip-x" aria-label={`Remove ${a.name}`} onClick={() => setD({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <textarea ref={bodyRef} className="compose-text" value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} aria-label="Message body" />
        {dragging && <div className="drop-hint">Drop files to attach</div>}
      </div>
    </div>
  )
}
