import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, Attachment, ComposeInit } from '../types'
import { applyTemplate } from '../data/templates'
import { useSettings } from '../settings'
import type { Template } from '../data/templates'
import { platform } from '../platform'
import { bodyText, escapeHtml, safeUrl, sanitizeHtml, signatureHtml, signatureText, textToHtml } from '../richtext'
import { formatSize } from '../util'
import { EMAIL_RE, bareAddress } from '../data/contacts'
import { matchCopiedEmail } from '../emailClipboard'
import { FileIcon } from './FileIcon'
import { RecipientField } from './RecipientField'
import { Icon } from './Icon'
import { WhenDialog } from './WhenDialog'
import type { IconName } from './Icon'

interface Props {
  init: ComposeInit
  accounts: Account[]
  pendingTemplate: Template | null
  onTemplateUsed: () => void
  offline?: boolean
  /** Gmail cannot schedule a send, so real mailboxes hide "Send later" */
  noSchedule?: boolean
  onSend: (d: ComposeInit, opts?: { sendAt?: string }) => void
  /** draft: what was typed (kept in Drafts); discarded: delete the open draft */
  onClose: (draft?: ComposeInit, discarded?: boolean) => void
  onToast: (m: string) => void
}

const DRAFT_KEY = 'pm.draft'

interface Box {
  top: number
  left: number
  width: number
  height: number
}

/** The reading pane's box (or the list pane when the reader is hidden). Null on phones, where the composer is already full screen. */
function readerBox(): Box | null {
  if (!window.matchMedia('(min-width: 900px)').matches) return null
  const el = document.querySelector<HTMLElement>('.workspace > .reader') ?? document.querySelector<HTMLElement>('.workspace > .list')
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top, left: r.left, width: r.width, height: r.height }
}

/** Prefilled addresses become chips: every finished address ends with a separator. */
function asChips(v: string | undefined): string {
  const t = (v ?? '').trim().replace(/[;,\s]+$/, '')
  return t ? `${t}, ` : ''
}

/** A reply or a forward carries the quoted original; those use the mailbox's "replies and forwards" signature. */
const isReplyLike = (init: ComposeInit): boolean => Boolean(init.reply) || init.body.includes('data-quote') || /^(re|fwd?):/i.test(init.subject)

/** The signature chosen by default for this mailbox and kind of message ('' = none). */
function defaultSigId(accounts: Account[], accountId: string, reply: boolean): string {
  const a = accounts.find((x) => x.id === accountId)
  return (reply ? a?.sigReply : a?.sigNew) ?? ''
}

function sigFor(accounts: Account[], accountId: string, sigId: string): string {
  return signatureHtml(accounts.find((a) => a.id === accountId)?.signatures?.find((g) => g.id === sigId)?.body ?? '')
}

/** New mail: caret line, then signature. Reply or forward: caret line, signature, then the quoted message. */
function initialBody(init: ComposeInit, accounts: Account[]): string {
  if (init.draftId) return init.body
  return `<div><br></div>${sigFor(accounts, init.accountId, defaultSigId(accounts, init.accountId, isReplyLike(init)))}${init.body}`
}

/** Which of the mailbox's signatures is in a body already: '' none, the id when it matches one, '*' when it is something else (an older draft). */
function sigInBody(html: string, accounts: Account[], accountId: string): string {
  if (!html.includes('data-sig')) return ''
  const a = accounts.find((x) => x.id === accountId)
  const hit = a?.signatures?.find((g) => html.includes(signatureHtml(g.body)))
  return hit ? hit.id : '*'
}

/** Files cannot be stored in the saved draft; only their names and sizes are. */
const forStorage = (d: ComposeInit): ComposeInit => ({ ...d, attachments: d.attachments.map(({ file: _file, ...a }) => a) })

function FBtn(props: { label: string; active?: boolean; onClick: () => void; icon?: IconName; children?: ReactNode }) {
  return (
    <button
      type="button"
      className={`fbtn${props.active ? ' on' : ''}`}
      aria-label={props.label}
      aria-pressed={props.active}
      onMouseDown={(e) => e.preventDefault()}
      onClick={props.onClick}
    >
      {props.icon ? <Icon name={props.icon} size={16} /> : props.children}
    </button>
  )
}

export function Composer({ init, accounts, offline, noSchedule, pendingTemplate, onTemplateUsed, onSend, onClose, onToast }: Props) {
  const { templates } = useSettings()
  const [initialHtml] = useState(() => initialBody(init, accounts))
  const [d, setD] = useState<ComposeInit>(() => ({ ...init, to: asChips(init.to), cc: asChips(init.cc), bcc: asChips(init.bcc), body: initialHtml }))
  const [later, setLater] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [dragging, setDragging] = useState(false)
  // The new message window opens at the size of the reading pane. The corner button switches to a small floating window.
  const [rect, setRect] = useState<Box | null>(readerBox)
  const [expanded, setExpanded] = useState(() => readerBox() !== null)
  const [showBcc, setShowBcc] = useState(Boolean(init.bcc))
  const [fmt, setFmt] = useState({ bold: false, italic: false, underline: false, ul: false, ol: false })
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const first = useRef(true)
  const latest = useRef(d)
  const finished = useRef(false)
  const touched = useRef(false)
  const ed = useRef<HTMLDivElement>(null)
  const savedRange = useRef<Range | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  const sync = () => {
    const el = ed.current
    if (el) setD((p) => ({ ...p, body: el.innerHTML }))
  }

  const exec = (cmd: string, value?: string) => {
    const el = ed.current
    if (!el) return
    el.focus()
    document.execCommand(cmd, false, value)
    sync()
    readFormat()
  }

  const readFormat = () => {
    const sel = document.getSelection()
    if (!sel || !ed.current || !sel.anchorNode || !ed.current.contains(sel.anchorNode)) return
    setFmt({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      ul: document.queryCommandState('insertUnorderedList'),
      ol: document.queryCommandState('insertOrderedList'),
    })
  }

  useEffect(() => {
    document.addEventListener('selectionchange', readFormat)
    return () => document.removeEventListener('selectionchange', readFormat)
  }, [])

  // Replies and forwards: put the caret at the top of the message.
  useEffect(() => {
    if (!init.to || !ed.current) return
    ed.current.focus()
    const r = document.createRange()
    r.setStart(ed.current, 0)
    r.collapse(true)
    const s = document.getSelection()
    s?.removeAllRanges()
    s?.addRange(r)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Restore an unsent draft once, only for blank new mail. Always sanitised.
  useEffect(() => {
    if (init.to || init.subject || init.attachments.length > 0 || init.body) return
    const raw = platform.storage.get(DRAFT_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as ComposeInit
      const body = sanitizeHtml(parsed.body ?? '')
      if (ed.current) ed.current.innerHTML = body
      setD({ ...parsed, to: asChips(parsed.to), cc: asChips(parsed.cc), bcc: asChips(parsed.bcc), body })
      setShowBcc(Boolean(parsed.bcc))
      onToast('Unsent draft restored')
    } catch {
      platform.storage.remove(DRAFT_KEY)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Autosave 1.2 s after the last edit. Closing earlier still keeps the draft (see unmount below).
  useEffect(() => {
    latest.current = d
    if (first.current) {
      first.current = false
      return
    }
    touched.current = true
    setSaved('saving')
    const t = window.setTimeout(() => {
      platform.storage.set(DRAFT_KEY, JSON.stringify(forStorage(d)))
      setSaved('saved')
    }, 1200)
    return () => window.clearTimeout(t)
  }, [d])

  // Closing the window keeps what was typed, even inside the 1.2 s autosave delay.
  useEffect(
    () => () => {
      if (touched.current && !finished.current) platform.storage.set(DRAFT_KEY, JSON.stringify(forStorage(latest.current)))
    },
    [],
  )

  /** Insert a template at the caret. An empty message is replaced by the template (signature kept). */
  const insertTemplate = (t: Template) => {
    const acc = accounts.find((a) => a.id === d.accountId)
    const filled = applyTemplate(t, {
      sender: signatureText(acc?.signature ?? '').split('\n')[0] ?? '',
      subject: d.subject.replace(/^(re|fwd?):\s*/i, ''),
    })
    const html = textToHtml(filled.body.replace(/\n*Best regards,\n[^\n]*$/, '\n\nBest regards,'))
    const el = ed.current
    if (el) {
      if (bodyText(el.innerHTML) === '') {
        const sig = el.querySelector('[data-sig]')?.outerHTML ?? ''
        el.innerHTML = `<div>${html}</div>${sig}`
      } else {
        el.focus()
        const sel = document.getSelection()
        const anchorEl = sel?.anchorNode ? (sel.anchorNode.nodeType === Node.TEXT_NODE ? sel.anchorNode.parentElement : (sel.anchorNode as Element)) : null
        if (!sel || !sel.anchorNode || !el.contains(sel.anchorNode) || anchorEl?.closest('[data-sig]')) {
          // No caret in the editor: insert at the end of the writing area (before signature and quote).
          const writing = Array.from(el.children).filter((c) => !c.matches('[data-sig], [data-quote]'))
          const r = document.createRange()
          r.selectNodeContents(writing[writing.length - 1] ?? el)
          r.collapse(false)
          sel?.removeAllRanges()
          sel?.addRange(r)
        }
        // Start on a fresh line when the caret is in the middle of text.
        const anchor = document.getSelection()?.anchorNode
        const host = anchor ? (anchor.nodeType === Node.TEXT_NODE ? anchor.parentElement : (anchor as Element)) : null
        const block = host?.closest('div, li, p')
        const list = host?.closest('ul, ol')
        if (list && block?.tagName === 'LI') {
          // Inside a list: continue after the list, not inside an item.
          const r = document.createRange()
          r.setStartAfter(list)
          r.collapse(true)
          const s2 = document.getSelection()
          s2?.removeAllRanges()
          s2?.addRange(r)
        } else if (block && block !== el && (block.textContent ?? '').trim()) document.execCommand('insertParagraph')
        document.execCommand('insertHTML', false, `<div>${html}</div>`)
      }
      sync()
    }
    setD((prev) => ({ ...prev, subject: prev.subject || filled.subject }))
    onToast(`Template inserted: ${t.name}. Fill the [bracketed] fields.`)
  }

  useEffect(() => {
    if (!pendingTemplate) return
    insertTemplate(pendingTemplate)
    onTemplateUsed()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingTemplate])

  /** Put the chosen signature in the message (replacing the one there, or adding it before the quoted original). '' removes it. */
  const applySignature = (sigId: string) => {
    const el = ed.current
    if (!el) return
    const cur = el.querySelector('[data-sig]')
    const tmp = document.createElement('div')
    tmp.innerHTML = sigFor(accounts, d.accountId, sigId)
    const node = tmp.firstElementChild
    if (cur) {
      if (node) cur.replaceWith(node)
      else cur.remove()
    } else if (node) {
      const quote = el.querySelector('[data-quote]')
      if (quote) el.insertBefore(node, quote)
      else el.appendChild(node)
    }
    sync()
  }

  const changeAccount = (id: string) => {
    const el = ed.current
    const cur = el?.querySelector('[data-sig]')
    if (el && cur) {
      // Another mailbox has its own signatures: use its default for this kind of message.
      const tmp = document.createElement('div')
      tmp.innerHTML = sigFor(accounts, id, defaultSigId(accounts, id, isReplyLike(init)))
      if (tmp.firstElementChild) cur.replaceWith(tmp.firstElementChild)
      else cur.remove()
    }
    setD((p) => ({ ...p, accountId: id, body: el ? el.innerHTML : p.body }))
  }

  const openLink = () => {
    const sel = document.getSelection()
    savedRange.current = sel && sel.rangeCount > 0 && ed.current?.contains(sel.anchorNode) ? sel.getRangeAt(0).cloneRange() : null
    setLinkUrl('')
    setLinkOpen(true)
  }

  const applyLink = () => {
    const url = safeUrl(linkUrl)
    const el = ed.current
    if (!url || !el) {
      onToast('Enter a valid web or email address')
      return
    }
    el.focus()
    const sel = document.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    if (!sel || sel.isCollapsed) document.execCommand('insertHTML', false, `<a href="${escapeHtml(url)}">${escapeHtml(linkUrl.trim())}</a>`)
    else document.execCommand('createLink', false, url)
    sync()
    setLinkOpen(false)
  }

  const addFiles = (files: FileList | File[]) => {
    const added: Attachment[] = Array.from(files).map((f, i) => ({
      id: `n${Date.now()}-${i}`,
      name: f.name,
      size: f.size,
      mime: f.type || 'application/octet-stream',
      file: f,
    }))
    if (added.length === 0) return
    setD((prev) => ({ ...prev, attachments: [...prev.attachments, ...added] }))
  }

  const canSend = d.to.trim().length > 0
  const sigNow = sigInBody(d.body, accounts, d.accountId)
  const mySigs = accounts.find((a) => a.id === d.accountId)?.signatures ?? []

  const send = (sendAt?: string) => {
    if (!canSend) {
      onToast('Add at least one recipient')
      return
    }
    const bad = [d.to, d.cc, d.bcc].flatMap((v) => v.split(/[;,\n]/)).map((t) => t.trim()).filter(Boolean).filter((t) => !EMAIL_RE.test(bareAddress(t)))
    if (bad.length > 0) {
      onToast(`Fix the highlighted address: ${bad[0]}`)
      return
    }
    if (offline) {
      onToast('You are offline. Your message is kept as a draft. Press Send again once you are back online.')
      return
    }
    finished.current = true
    platform.storage.remove(DRAFT_KEY)
    onSend(d, sendAt ? { sendAt } : undefined)
  }

  const measure = () => setRect(readerBox())
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

  const discard = () => {
    finished.current = true
    platform.storage.remove(DRAFT_KEY)
    onClose(undefined, true)
    onToast('Draft discarded')
  }

  /** Close: anything typed goes to the Drafts folder (reopen it from there). */
  const close = () => {
    const x = latest.current
    const holder = document.createElement('div')
    holder.innerHTML = x.body
    holder.querySelectorAll('[data-sig]').forEach((n) => n.remove())
    const has = x.to.trim() !== '' || x.cc.trim() !== '' || x.subject.trim() !== '' || (holder.textContent ?? '').trim() !== '' || x.attachments.length > 0
    if (touched.current && has) {
      finished.current = true
      platform.storage.remove(DRAFT_KEY)
      onClose(x)
    } else {
      if (!has) platform.storage.remove(DRAFT_KEY)
      onClose()
    }
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
        const mod = e.ctrlKey || e.metaKey
        if ((mod && e.key === 'Enter') || (e.altKey && !mod && e.key.toLowerCase() === 's')) {
          e.preventDefault()
          send()
        } else if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
          e.preventDefault()
          platform.storage.set(DRAFT_KEY, JSON.stringify(forStorage(latest.current)))
          setSaved('saved')
          onToast('Draft saved')
        } else if (mod && e.shiftKey && e.key.toLowerCase() === 'l') {
          e.preventDefault()
          exec('insertUnorderedList')
        } else if (e.key === 'Escape') close()
      }}
    >
      <div className="composer-head">
        <strong className="grow ellipsis">{d.subject || 'New message'}</strong>
        <span className="muted">{saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Draft saved' : ''}</span>
        <button type="button" className="icon-btn only-desktop" onClick={toggleExpanded} aria-label={expanded ? 'Restore size' : 'Expand to reading pane size'}>
          <Icon name={expanded ? 'collapse' : 'expand'} />
        </button>
        <button type="button" className="icon-btn" onClick={close} aria-label="Close and keep draft">
          <Icon name="close" />
        </button>
      </div>
      <div className="composer-bar" role="toolbar" aria-label="Message actions">
        <button type="button" className="primary" onClick={() => send()} disabled={!canSend}>
          <Icon name="send" size={16} /> Send
        </button>
        {!noSchedule && (
          <button type="button" onClick={() => (canSend ? setLater(true) : onToast('Add at least one recipient'))} aria-haspopup="dialog">
            <Icon name="clock" size={16} tone="orange" /> Send later
          </button>
        )}
        <button type="button" onClick={() => fileInput.current?.click()}>
          <Icon name="clip" size={16} tone="blue" /> Attach
        </button>
        <select
          aria-label="Insert template"
          value=""
          onChange={(e) => {
            const t = templates.find((x) => x.id === e.target.value)
            if (t) insertTemplate(t)
          }}
        >
          <option value="">Templates…</option>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.category} – {t.name}
            </option>
          ))}
        </select>
        <span className="grow" />
        <button type="button" onClick={discard} aria-label="Discard draft">
          <Icon name="trash" size={16} tone="red" />
        </button>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
      </div>
      <div className="composer-body">
        <label className="field">
          <span>From</span>
          <select value={d.accountId} onChange={(e) => changeAccount(e.target.value)}>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} &lt;{a.email}&gt;
              </option>
            ))}
          </select>
        </label>
        <RecipientField label="To" value={d.to} onChange={(v) => setD((p) => ({ ...p, to: v }))} autoFocus={!d.to} />
        <RecipientField
          label="Cc"
          value={d.cc}
          onChange={(v) => setD((p) => ({ ...p, cc: v }))}
          rightSlot={
            !showBcc ? (
              <button type="button" className="link" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            ) : undefined
          }
        />
        {showBcc && <RecipientField label="Bcc" value={d.bcc} onChange={(v) => setD((p) => ({ ...p, bcc: v }))} />}
        <label className="field">
          <span>Subject</span>
          <input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} />
        </label>
        {d.attachments.length > 0 && (
          <div className="chips composer-chips">
            {d.attachments.map((a) => (
              <span key={a.id} className="chip">
                <FileIcon name={a.name} mime={a.mime} size={22} />
                <span className="chip-name">{a.name}</span>
                <span className="chip-size">{formatSize(a.size)}</span>
                <button type="button" className="chip-x" aria-label={`Remove ${a.name}`} onClick={() => setD({ ...d, attachments: d.attachments.filter((x) => x.id !== a.id) })}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="format-bar" role="toolbar" aria-label="Formatting">
          <FBtn label="Bold (Ctrl+B)" active={fmt.bold} onClick={() => exec('bold')}>
            <b>B</b>
          </FBtn>
          <FBtn label="Italic (Ctrl+I)" active={fmt.italic} onClick={() => exec('italic')}>
            <i>I</i>
          </FBtn>
          <FBtn label="Underline (Ctrl+U)" active={fmt.underline} onClick={() => exec('underline')}>
            <u>U</u>
          </FBtn>
          <span className="fsep" />
          <FBtn label="Bulleted list" icon="listBullet" active={fmt.ul} onClick={() => exec('insertUnorderedList')} />
          <FBtn label="Numbered list" icon="listNumber" active={fmt.ol} onClick={() => exec('insertOrderedList')} />
          <span className="fsep" />
          <FBtn label="Insert link (Ctrl+K)" icon="link" onClick={openLink} />
          <FBtn label="Clear formatting" icon="clearFormat" onClick={() => exec('removeFormat')} />
          <span className="grow" />
          {(mySigs.length > 0 || sigNow !== '') && (
            <label className={`fchip sig-pick${sigNow ? ' on' : ''}`}>
              <span className="sig-pick-label" aria-hidden="true">
                Signature:
              </span>
              <select aria-label="Signature" value={sigNow} onChange={(e) => applySignature(e.target.value)}>
                <option value="">No signature</option>
                {sigNow === '*' && <option value="*" disabled>Current signature</option>}
                {mySigs.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name || 'Untitled'}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {linkOpen && (
          <div className="link-row">
            <input
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
              placeholder="Web or email address"
              aria-label="Link address"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  applyLink()
                } else if (e.key === 'Escape') {
                  e.stopPropagation()
                  setLinkOpen(false)
                }
              }}
            />
            <button type="button" className="btn primary" onClick={applyLink}>
              Add link
            </button>
            <button type="button" className="btn" onClick={() => setLinkOpen(false)}>
              Cancel
            </button>
          </div>
        )}

        <div
          ref={ed}
          className="editor"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Message body"
          spellCheck
          onInput={sync}
          onMouseDown={(e) => {
            // Clicking blank space below the text: put the caret in the writing area, never in the signature or quote.
            const el = ed.current
            const hit = e.target as Element
            if (el && (hit === e.currentTarget || hit.closest('[data-sig]')) && el.firstElementChild) {
              e.preventDefault()
              el.focus()
              const r = document.createRange()
              const writing = Array.from(el.children).filter((c) => !c.matches('[data-sig], [data-quote]'))
              r.selectNodeContents(writing[0] ?? el.firstElementChild)
              r.collapse(false)
              const sel = document.getSelection()
              sel?.removeAllRanges()
              sel?.addRange(r)
            }
          }}
          onPaste={(e) => {
            // Paste as plain text: keeps messages clean and blocks pasted markup.
            e.preventDefault()
            const pasted = e.clipboardData.getData('text/plain')
            const mine = matchCopiedEmail(pasted)
            // An email copied with "Copy email" keeps its header block; anything else pastes as plain text.
            if (mine) document.execCommand('insertHTML', false, sanitizeHtml(mine))
            else document.execCommand('insertText', false, pasted)
          }}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
              e.preventDefault()
              openLink()
            }
          }}
          dangerouslySetInnerHTML={{ __html: initialHtml }}
        />
        {dragging && <div className="drop-hint">Drop files to attach</div>}
      </div>
      {later && (
        <WhenDialog
          mode="send"
          onClose={() => setLater(false)}
          onPick={(iso) => {
            setLater(false)
            if (iso) send(iso)
          }}
        />
      )}
    </div>
  )
}
