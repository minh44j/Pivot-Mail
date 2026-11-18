import { useState } from 'react'
import type { ReactNode } from 'react'
import type { Account, Colour, Density, PaneLayout } from '../types'
import { COLOURS } from '../data/colours'
import type { Template } from '../data/templates'
import { mergeColours } from '../settings'
import logoLockup from '../assets/brand/logo-lockup.png'
import { Icon } from './Icon'

import { RealUsers } from './RealUsers'
import { SignatureEditor } from './SignatureEditor'
import { UsersPanel } from './UsersPanel'
import { PROBLEMS } from '../problems'
import type { Problem } from '../problems'

type Section = 'general' | 'signatures' | 'templates' | 'colours' | 'users' | 'problems'

interface Props {
  role: 'admin' | 'staff'
  accounts: Account[]
  onSignature: (accountId: string, text: string) => void
  templates: Template[]
  onSaveTemplate: (t: Template) => void
  onDeleteTemplate: (id: string) => void
  colourNames: Partial<Record<Colour, string>>
  onColourName: (c: Colour, name: string) => void
  onResetColours: () => void
  threaded: boolean
  onThreaded: (v: boolean) => void
  pane: PaneLayout
  onPane: (p: PaneLayout) => void
  density: Density
  onDensity: (d: Density) => void
  showSmart: boolean
  onShowSmart: (v: boolean) => void
  notifications: NotificationPermission | 'unsupported'
  onEnableNotifications: () => void
  /** Real sign-in is used (not the preview): the Users section shows the real people */
  signedIn?: boolean
  /** Signed-in use only: the person's own job title */
  title?: string
  onTitle: (t: string) => Promise<boolean>
  city: string
  onCity: (v: string) => void
  undoDelay: string
  onUndoDelay: (v: string) => void
  onBack: () => void
  sim: Problem | null
  onSim: (p: Problem | null) => void
  onToast: (m: string) => void
}

const SECTIONS: { id: Section; label: string }[] = [
  { id: 'general', label: 'General' },
  { id: 'signatures', label: 'Signatures' },
  { id: 'templates', label: 'Templates' },
  { id: 'colours', label: 'Colour categories' },
  { id: 'users', label: 'Users and roles' },
  { id: 'problems', label: 'Problem states' },
]

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={props.checked} aria-label={props.label} className={`switch${props.checked ? ' on' : ''}`} onClick={() => props.onChange(!props.checked)}>
      <span />
    </button>
  )
}

function Row(props: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="srow">
      <div className="grow">
        <div className="srow-title">{props.title}</div>
        {props.hint && <small>{props.hint}</small>}
      </div>
      {props.children}
    </div>
  )
}

function Segmented<T extends string>(props: { value: T; options: { id: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={props.label}>
      {props.options.map((o) => (
        <button key={o.id} type="button" className={props.value === o.id ? 'on' : ''} aria-pressed={props.value === o.id} onClick={() => props.onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/* ---------- templates ---------- */
function TemplateEditor(props: { initial: Template; categories: string[]; isAdmin: boolean; onSave: (t: Template) => void; onCancel: () => void }) {
  const [t, setT] = useState<Template>(props.initial)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const save = () => {
    const e: Record<string, string> = {}
    if (!t.name.trim()) e.name = 'Give the template a name'
    if (!t.category.trim()) e.category = 'Choose or type a category'
    if (!t.body.trim()) e.body = 'The template needs some text'
    setErrors(e)
    if (Object.keys(e).length === 0) props.onSave({ ...t, name: t.name.trim(), category: t.category.trim() })
  }

  return (
    <form
      className="tpl-form"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      noValidate
    >
      <label className="fld">
        <span>Name</span>
        <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} aria-invalid={Boolean(errors.name)} autoFocus />
        {errors.name && <em className="err">{errors.name}</em>}
      </label>
      <div className="fld-row">
        <label className="fld">
          <span>Category</span>
          <input list="tpl-cats" value={t.category} onChange={(e) => setT({ ...t, category: e.target.value })} aria-invalid={Boolean(errors.category)} />
          <datalist id="tpl-cats">
            {props.categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          {errors.category && <em className="err">{errors.category}</em>}
        </label>
        <div className="fld">
          <span id="tpl-scope">Who can use it</span>
          <div className="opts" role="radiogroup" aria-labelledby="tpl-scope">
            <button type="button" role="radio" aria-checked={t.scope !== 'shared'} className={`opt${t.scope !== 'shared' ? ' on' : ''}`} onClick={() => setT({ ...t, scope: 'personal' })}>
              Only me
            </button>
            <button type="button" role="radio" aria-checked={t.scope === 'shared'} disabled={!props.isAdmin} className={`opt${t.scope === 'shared' ? ' on' : ''}`} onClick={() => setT({ ...t, scope: 'shared' })}>
              Whole team
            </button>
          </div>
          {!props.isAdmin && <small>Only administrators can share templates.</small>}
        </div>
      </div>
      <label className="fld">
        <span>Subject (optional)</span>
        <input value={t.subject} onChange={(e) => setT({ ...t, subject: e.target.value })} />
      </label>
      <label className="fld">
        <span>Message</span>
        <textarea rows={10} value={t.body} onChange={(e) => setT({ ...t, body: e.target.value })} aria-invalid={Boolean(errors.body)} />
        {errors.body && <em className="err">{errors.body}</em>}
        <small>
          Use <code>{'{{client}}'}</code>, <code>{'{{route}}'}</code> or <code>{'{{sender}}'}</code> as placeholders. Unknown placeholders become [bracketed] fields to fill in by hand.
        </small>
      </label>
      <div className="modal-actions">
        <button type="submit" className="btn primary">
          Save template
        </button>
        <button type="button" className="btn" onClick={props.onCancel}>
          Cancel
        </button>
      </div>
    </form>
  )
}

function TitleRow({ title, onSave }: { title: string; onSave: (t: string) => Promise<boolean> }) {
  const [v, setV] = useState(title)
  const [state, setState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const save = async () => {
    if (v.trim() === title) return
    setState('saving')
    setState((await onSave(v)) ? 'saved' : 'error')
  }
  return (
    <Row title="Job title" hint="Shown under your name in the top bar, for example Operations Associate. Only you can change it.">
      <span className="title-edit">
        <input className="input" value={v} maxLength={60} onChange={(e) => { setV(e.target.value); setState('idle') }} onBlur={() => void save()} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} aria-label="Job title" placeholder="e.g. Operations Associate" />
        <small role="status" className="muted">{state === 'saving' ? 'Saving…' : state === 'saved' ? 'Saved' : state === 'error' ? 'Could not save' : ''}</small>
      </span>
    </Row>
  )
}

export function SettingsPage(p: Props) {
  const [section, setSection] = useState<Section>('general')
  const [editing, setEditing] = useState<Template | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const isAdmin = p.role === 'admin'
  const categories = Array.from(new Set(p.templates.map((t) => t.category)))
  const colourLabels = mergeColours(p.colourNames)

  const canEdit = (t: Template): boolean => t.scope === 'personal' || (t.scope === 'shared' && isAdmin)
  const newTemplate = (): Template => ({ id: `custom-${Date.now()}`, category: categories[0] ?? 'General', scope: 'personal', name: '', subject: '', body: '' })

  return (
    <main className="perf settings">
      <header className="perf-head">
        <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={p.onBack} aria-label="Back to mail">
          <Icon name="back" />
        </button>
        <img src={logoLockup} alt="Pivot Mail" className="logo-bar" />
        <span className="head-divider" aria-hidden="true" />
        <h1>Settings</h1>
      </header>

      <div className="settings-body">
        <nav className="settings-nav" aria-label="Settings sections">
          {SECTIONS.filter((s) => s.id !== 'users' || isAdmin).map((s) => (
            <button
              key={s.id}
              type="button"
              className={section === s.id ? 'on' : ''}
              aria-current={section === s.id ? 'page' : undefined}
              onClick={() => {
                setSection(s.id)
                setEditing(null)
              }}
            >
              {s.label}
            </button>
          ))}
        </nav>

        <div className="settings-content">
          <p className="notice" role="note">
            {p.signedIn ? (
              <>
                <strong>Saved in this browser.</strong> Your job title and the Users list are saved on the server; the other settings stay on this device for now.
              </>
            ) : (
              <>
                <strong>Preview.</strong> Settings are saved in this browser only. In the real app they sync with your account.
              </>
            )}
          </p>

          {section === 'general' && (
            <section className="card" aria-labelledby="h-general">
              <h2 id="h-general" className="card-title">
                General
              </h2>
              <Row title="Group messages by conversation" hint="Show a thread as one line in the message list.">
                <Switch checked={p.threaded} onChange={p.onThreaded} label="Group messages by conversation" />
              </Row>
              <Row title="Smart categories" hint="Show one-click filters above the message list: Unread, Important, Follow up, Attachments, Today.">
                <Switch checked={p.showSmart} onChange={p.onShowSmart} label="Show smart categories" />
              </Row>
              <Row title="Reading pane">
                <Segmented
                  label="Reading pane"
                  value={p.pane}
                  onChange={p.onPane}
                  options={[
                    { id: 'right', label: 'Right' },
                    { id: 'bottom', label: 'Bottom' },
                    { id: 'off', label: 'Hidden' },
                  ]}
                />
              </Row>
              <Row title="List density">
                <Segmented
                  label="List density"
                  value={p.density}
                  onChange={p.onDensity}
                  options={[
                    { id: 'comfortable', label: 'Comfortable' },
                    { id: 'compact', label: 'Compact' },
                  ]}
                />
              </Row>
              {p.title !== undefined && <TitleRow key={p.title} title={p.title} onSave={p.onTitle} />}
              <Row title="Weather city" hint="Shown next to your name. Only the city name is sent to the weather service. Leave empty to hide it.">
                <input className="input" value={p.city} maxLength={60} onChange={(e) => p.onCity(e.target.value)} aria-label="Weather city" placeholder="e.g. Riyadh" />
              </Row>
              <Row title="Undo send" hint="Hold a sent message for a moment so you can take it back.">
                <Segmented
                  label="Undo send delay"
                  value={p.undoDelay}
                  onChange={p.onUndoDelay}
                  options={[
                    { id: '0', label: 'Off' },
                    { id: '5', label: '5 s' },
                    { id: '10', label: '10 s' },
                    { id: '20', label: '20 s' },
                    { id: '30', label: '30 s' },
                  ]}
                />
              </Row>
              <Row
                title="Desktop notifications"
                hint={p.notifications === 'granted' ? 'On' : p.notifications === 'denied' ? 'Blocked in your browser settings' : p.notifications === 'unsupported' ? 'Not supported in this browser' : 'Get an alert when new mail arrives'}
              >
                <button type="button" className="btn" disabled={p.notifications !== 'default'} onClick={p.onEnableNotifications}>
                  Turn on
                </button>
              </Row>
            </section>
          )}

          {section === 'users' && isAdmin && (p.signedIn ? <RealUsers onToast={p.onToast} /> : <UsersPanel onToast={p.onToast} />)}

          {section === 'problems' && (
            <section className="card" aria-labelledby="h-prob">
              <h2 id="h-prob" className="card-title">
                Preview problem states
              </h2>
              <p className="muted">See how Pivot Mail behaves when something goes wrong. Nothing is changed on your account. Full-screen states offer their own way back.</p>
              {PROBLEMS.map((pr) => (
                <Row key={pr.id} title={pr.label} hint={pr.hint}>
                  <button type="button" className="btn" aria-pressed={p.sim === pr.id} onClick={() => p.onSim(pr.id)}>
                    Show
                  </button>
                </Row>
              ))}
              <Row title="Back to normal" hint={p.sim ? `Currently showing: ${PROBLEMS.find((x) => x.id === p.sim)?.label}` : 'No problem is being simulated'}>
                <button type="button" className="btn" disabled={!p.sim} onClick={() => p.onSim(null)}>
                  Clear
                </button>
              </Row>
            </section>
          )}

          {section === 'signatures' && (
            <section className="card" aria-labelledby="h-sig">
              <h2 id="h-sig" className="card-title">
                Signatures
              </h2>
              <p className="muted">One signature per mailbox. It is added to new messages sent from that mailbox and can be turned off in the composer.</p>
              {p.accounts.map((a) => (
                <SignatureEditor key={a.id} label={`${a.name} · ${a.email}`} value={a.signature} onChange={(v) => p.onSignature(a.id, v)} />
              ))}
              <small>Saved automatically. Paste a picture (or a whole signature), drop one in, or use Add picture. Click a picture to resize it.</small>
            </section>
          )}

          {section === 'templates' && (
            <section className="card" aria-labelledby="h-tpl">
              <h2 id="h-tpl" className="card-title">
                Templates
              </h2>
              {editing ? (
                <TemplateEditor
                  key={editing.id}
                  initial={editing}
                  categories={categories}
                  isAdmin={isAdmin}
                  onCancel={() => setEditing(null)}
                  onSave={(t) => {
                    p.onSaveTemplate(t)
                    setEditing(null)
                    p.onToast('Template saved')
                  }}
                />
              ) : (
                <>
                  <div className="tpl-top">
                    <p className="muted grow">
                      Starter templates are read-only. Duplicate one to make your own. {isAdmin ? 'As an administrator you can also manage shared templates.' : 'Shared templates are managed by administrators.'}
                    </p>
                    <button type="button" className="btn primary" onClick={() => setEditing(newTemplate())}>
                      New template
                    </button>
                  </div>
                  {categories.map((cat) => (
                    <div key={cat} className="tpl-group">
                      <h3>{cat}</h3>
                      {p.templates
                        .filter((t) => t.category === cat)
                        .map((t) => (
                          <div key={t.id} className="tpl-row">
                            <div className="grow">
                              <strong>{t.name}</strong>
                              <span className="tag">{t.scope === 'shared' ? 'Team' : t.scope === 'personal' ? 'Mine' : 'Starter'}</span>
                            </div>
                            {canEdit(t) ? (
                              <>
                                <button type="button" className="btn quiet" onClick={() => setEditing(t)}>
                                  Edit
                                </button>
                                {confirmDelete === t.id ? (
                                  <>
                                    <button
                                      type="button"
                                      className="btn danger"
                                      onClick={() => {
                                        p.onDeleteTemplate(t.id)
                                        setConfirmDelete(null)
                                        p.onToast('Template deleted')
                                      }}
                                    >
                                      Delete
                                    </button>
                                    <button type="button" className="btn quiet" onClick={() => setConfirmDelete(null)}>
                                      Keep
                                    </button>
                                  </>
                                ) : (
                                  <button type="button" className="btn quiet" onClick={() => setConfirmDelete(t.id)}>
                                    Delete
                                  </button>
                                )}
                              </>
                            ) : (
                              <button type="button" className="btn quiet" onClick={() => setEditing({ ...t, id: `custom-${Date.now()}`, name: `${t.name} (copy)`, scope: 'personal' })}>
                                Duplicate
                              </button>
                            )}
                          </div>
                        ))}
                    </div>
                  ))}
                </>
              )}
            </section>
          )}

          {section === 'colours' && (
            <section className="card" aria-labelledby="h-col">
              <h2 id="h-col" className="card-title">
                Colour categories
              </h2>
              <p className="muted">Rename the six colours so they match how your team works. Colours also show as a text label, never colour alone.</p>
              {COLOURS.map((c) => (
                <label key={c.id} className="srow col-row">
                  <span className={`dot c-${c.id}`} aria-hidden="true" />
                  <input
                    className="col-input"
                    value={p.colourNames[c.id] ?? ''}
                    placeholder={c.label}
                    maxLength={24}
                    onChange={(e) => p.onColourName(c.id, e.target.value)}
                    aria-label={`Name for the ${c.id} category`}
                  />
                  <small>{colourLabels.find((x) => x.id === c.id)?.label}</small>
                </label>
              ))}
              <button type="button" className="btn" onClick={p.onResetColours}>
                Reset to defaults
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
