import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode, RefObject } from 'react'
import { createPortal } from 'react-dom'
import { combo } from '../shortcuts'
import { cellAtCaret, directionAtCaret, setDirection, setFontSize, tableAction, tableHtml } from '../compose/editorOps'
import type { TableAction } from '../compose/editorOps'
import { Icon } from './Icon'
import type { IconName } from './Icon'

/**
 * The writing toolbar, as in Outlook and Gmail (Minhaj 2026-11-22): undo/redo, paragraph style, font, size, bold, italic,
 * underline, strikethrough, text colour, highlight, alignment, indent, left-to-right / right-to-left (Arabic), lists, link,
 * table, picture, line, emoji, clear formatting. Every pop-up is placed on the page itself, above everything.
 */

const FONTS = ['Calibri', 'Arial', 'Segoe UI', 'Helvetica', 'Verdana', 'Tahoma', 'Georgia', 'Times New Roman', 'Courier New']
const SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36, 48, 72]
const STYLES: { id: string; label: string }[] = [
  { id: 'div', label: 'Normal' },
  { id: 'h1', label: 'Heading 1' },
  { id: 'h2', label: 'Heading 2' },
  { id: 'h3', label: 'Heading 3' },
  { id: 'blockquote', label: 'Quote' },
  { id: 'pre', label: 'Code' },
]
const COLOURS = ['#000000', '#444444', '#888888', '#c00000', '#e2001a', '#ff8a00', '#ffc000', '#1e8e3e', '#0a7c6e', '#0a64c2', '#1e3a5f', '#5b2bb5', '#c2185b', '#c39b45', '#ffffff']
const HIGHLIGHTS = ['#fff59d', '#ffe082', '#c8e6c9', '#b3e5fc', '#f8bbd0', '#e1bee7', '#ffccbc', '#e0e0e0']
const EMOJI: { name: string; list: string }[] = [
  { name: 'Smileys', list: '😀 😃 😄 😁 😊 🙂 😉 😍 🤩 😘 😎 🤗 🤔 😐 😅 😂 🤣 😢 😭 😮 😴 😷 🙏 😇' },
  { name: 'Hands', list: '👍 👎 👌 ✌️ 🤝 👏 🙌 👋 ✋ 👉 👈 👆 👇 💪 ✍️ 🫡' },
  { name: 'Work', list: '✅ ☑️ ❌ ⚠️ ❗ ❓ 📌 📎 📄 📑 📊 📈 📉 🗓️ ⏰ ⏳ 📞 📧 💼 🔒 🔑 💡 🎯 🚀' },
  { name: 'Travel', list: '✈️ 🛫 🛬 🚢 ⚓ 🚚 🚛 🚗 🚕 🚆 🏨 🏢 🌍 🌏 🗺️ 🧳 🛂 🛃 📦 🕋 🕌' },
  { name: 'Symbols', list: '❤️ 💙 💚 💛 ⭐ 🌟 ✨ 🔥 🎉 🎊 🏆 🥇 💯 🔔 ➡️ ⬅️ ⬆️ ⬇️ 🔴 🟢 🟡 🔵' },
]

type Pop = 'colour' | 'highlight' | 'table' | 'emoji' | 'tableEdit' | 'more' | null

/** A button of a group, as it shows in the "More" menu when its group is folded away. */
interface MenuItem {
  label: string
  icon: IconName
  on?: boolean
  run: (e: React.MouseEvent<HTMLButtonElement>) => void
}

/**
 * Groups of the toolbar, left to right. `fold` is the order in which a group goes into "More" when the line is too narrow
 * (1 first); 0 never folds. One clean line instead of a ragged second row (Minhaj 2026-11-23: "make this clean").
 */
interface Group {
  id: string
  fold: number
  body: ReactNode
  menu?: MenuItem[]
  /** Shown as it is inside "More" (the style, font and size lists) */
  menuBody?: ReactNode
}

const MORE_W = 36

interface Props {
  editor: RefObject<HTMLDivElement | null>
  /** Save the editor's content (after any change made here) */
  onChange: () => void
  onLink: () => void
  onPictures: (files: File[]) => void
}

interface TBProps {
  label: string
  icon?: IconName
  on?: boolean
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
  children?: ReactNode
  trigger?: boolean
  disabled?: boolean
}

/** One toolbar button. The mouse press never takes the caret out of the mail. */
function B(p: TBProps) {
  return (
    <button
      type="button"
      className={`fbtn${p.on ? ' on' : ''}${p.trigger ? ' ctb-trigger' : ''}`}
      aria-label={p.label}
      title={p.label}
      aria-pressed={p.trigger ? undefined : p.on}
      aria-haspopup={p.trigger ? 'menu' : undefined}
      disabled={p.disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={p.onClick}
    >
      {p.icon ? <Icon name={p.icon} size={16} /> : p.children}
    </button>
  )
}

/** A toolbar list (style, font, size). Opening it remembers the caret; picking acts there. */
function Pick({ label, options, onPick, onOpen, className = '' }: { label: string; options: { value: string; label: string }[]; onPick: (v: string) => void; onOpen: () => void; className?: string }) {
  return (
    <label className={`ctb-select ${className}`}>
      <select
        aria-label={label}
        value=""
        onMouseDown={onOpen}
        onFocus={onOpen}
        onChange={(e) => {
          if (e.target.value) onPick(e.target.value)
        }}
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron" size={12} />
    </label>
  )
}

export function ComposeToolbar({ editor, onChange, onLink, onPictures }: Props) {
  const saved = useRef<Range | null>(null)
  const picture = useRef<HTMLInputElement>(null)
  const [pop, setPop] = useState<{ kind: Pop; x: number; y: number } | null>(null)
  const [grid, setGrid] = useState({ r: 3, c: 3 })
  // Groups folded into "More" because the line is too narrow; each group's width is remembered while it shows.
  const row = useRef<HTMLDivElement>(null)
  const moreId = useId().replace(/:/g, '')
  const pictureId = `${moreId}-picture`
  const widths = useRef<Record<string, number>>({})
  const [hidden, setHidden] = useState<string[]>([])
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const fit = () => {
      for (const g of Array.from(el.querySelectorAll<HTMLElement>('[data-group]'))) if (!g.hidden) widths.current[g.dataset.group ?? ''] = g.offsetWidth
      const order = Array.from(el.querySelectorAll<HTMLElement>('[data-group]')).map((g) => ({ id: g.dataset.group ?? '', fold: Number(g.dataset.fold ?? 0) }))
      const room = el.clientWidth
      let used = order.reduce((n, g) => n + (widths.current[g.id] ?? 0), 0)
      const out: string[] = []
      if (used > room) {
        used += MORE_W
        for (const g of [...order].filter((x) => x.fold > 0).sort((a, b) => a.fold - b.fold)) {
          if (used <= room) break
          out.push(g.id)
          used -= widths.current[g.id] ?? 0
        }
      }
      setHidden((h) => (h.join() === out.join() ? h : out))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const [state, setState] = useState({ bold: false, italic: false, underline: false, strike: false, ul: false, ol: false, align: 'left', rtl: false, inTable: false })

  // Remember where the caret was in the mail, so a menu or a list (which takes the focus) acts on that place.
  const readState = useRef<() => void>(() => {})
  useEffect(() => {
    const onSel = () => {
      const el = editor.current
      const sel = document.getSelection()
      if (!el || !sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) return
      saved.current = sel.getRangeAt(0).cloneRange()
      setState({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
        underline: document.queryCommandState('underline'),
        strike: document.queryCommandState('strikeThrough'),
        ul: document.queryCommandState('insertUnorderedList'),
        ol: document.queryCommandState('insertOrderedList'),
        align: document.queryCommandState('justifyCenter') ? 'center' : document.queryCommandState('justifyRight') ? 'right' : 'left',
        rtl: directionAtCaret(el) === 'rtl',
        inTable: cellAtCaret(el) !== null,
      })
    }
    readState.current = onSel
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [editor])

  const restore = (): HTMLDivElement | null => {
    const el = editor.current
    if (!el) return null
    el.focus()
    const sel = document.getSelection()
    if (saved.current && sel && !(sel.rangeCount > 0 && el.contains(sel.anchorNode))) {
      sel.removeAllRanges()
      sel.addRange(saved.current)
    }
    return el
  }
  /** A browser editing command on the remembered selection; styles are written as inline CSS (what mail clients read). */
  const run = (cmd: string, value?: string, css = true) => {
    if (!restore()) return
    document.execCommand('styleWithCSS', false, String(css))
    document.execCommand(cmd, false, value)
    onChange()
    // The buttons show the new state at once (not only when the caret next moves).
    readState.current()
  }
  /** Insert something (line, table, picture, emoji) after the selection: never over selected words, which would be lost. */
  const insert = (cmd: 'insertHTML' | 'insertText' | 'insertHorizontalRule', value?: string) => {
    if (!restore()) return
    document.getSelection()?.collapseToEnd()
    document.execCommand('styleWithCSS', false, 'false')
    document.execCommand(cmd, false, value)
    onChange()
    readState.current()
  }
  const act = (fn: (el: HTMLDivElement) => void) => {
    const el = restore()
    if (!el) return
    fn(el)
    onChange()
    readState.current()
  }
  const open = (kind: Pop, e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setPop((p) => (p?.kind === kind ? null : { kind, x: Math.max(8, Math.min(r.left, window.innerWidth - 300)), y: r.bottom + 4 }))
  }
  useEffect(() => {
    if (!pop) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setPop(null)
      }
    }
    const onDown = (e: MouseEvent) => {
      if (!(e.target as Element).closest('.ctb-pop, .ctb-trigger')) setPop(null)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('mousedown', onDown)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('mousedown', onDown)
    }
  }, [pop])

  // A panel that would run off the bottom of the window opens above its button instead (or fits the window and scrolls).
  const placePop = (el: HTMLDivElement | null) => {
    if (!el || !pop) return
    const h = el.offsetHeight
    if (pop.y + h <= window.innerHeight - 8) return
    const above = pop.y - h - 40
    el.style.top = `${above >= 8 ? above : Math.max(8, window.innerHeight - 8 - h)}px`
  }

  const remember = () => {
    const sel = document.getSelection()
    if (sel && sel.rangeCount > 0 && editor.current?.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange()
  }

  const tableActs: { a: TableAction; label: string }[] = [
    { a: 'rowAbove', label: 'Insert row above' },
    { a: 'rowBelow', label: 'Insert row below' },
    { a: 'colLeft', label: 'Insert column left' },
    { a: 'colRight', label: 'Insert column right' },
    { a: 'delRow', label: 'Delete row' },
    { a: 'delCol', label: 'Delete column' },
    { a: 'delTable', label: 'Delete table' },
  ]

  // The "More" menu acts after the menu closes, at the remembered caret.
  const fromMenu = (it: MenuItem) => (e: React.MouseEvent<HTMLButtonElement>) => {
    setPop(null)
    it.run(e)
  }
  /** From the More menu, a panel (emoji, table) opens under the More button. */
  const openAtMore = (kind: Pop, e: React.MouseEvent<HTMLButtonElement>) => {
    const anchor = e.currentTarget.ownerDocument.querySelector<HTMLElement>(`#${moreId} .ctb-more`) ?? e.currentTarget
    const r = anchor.getBoundingClientRect()
    setPop({ kind, x: Math.max(8, Math.min(r.left, window.innerWidth - 300)), y: r.bottom + 4 })
  }
  const emojiAt = (e: React.MouseEvent<HTMLButtonElement>) => openAtMore('emoji', e)

  const groups: Group[] = [
    {
      id: 'history',
      fold: 4,
      body: (
        <>
          <B label={`Undo (${combo('Z')})`} icon="undo" onClick={() => run('undo')} />
          <B label="Redo" icon="redo" onClick={() => run('redo')} />
        </>
      ),
      menu: [
        { label: 'Undo', icon: 'undo', run: () => run('undo') },
        { label: 'Redo', icon: 'redo', run: () => run('redo') },
      ],
    },
    {
      id: 'text',
      fold: 7,
      body: (
        <>
          <Pick label="Style" options={STYLES.map((x) => ({ value: x.id, label: x.label }))} onOpen={remember} onPick={(v) => run('formatBlock', v, false)} className="ctb-style" />
          <Pick label="Font" options={FONTS.map((f) => ({ value: f, label: f }))} onOpen={remember} onPick={(v) => run('fontName', v)} className="ctb-font" />
          <Pick label="Size" options={SIZES.map((n) => ({ value: String(n), label: `${n}` }))} onOpen={remember} onPick={(v) => act((el) => setFontSize(el, Number(v)))} className="ctb-size" />
        </>
      ),
      menuBody: (
        <>
          <Pick label="Style" options={STYLES.map((x) => ({ value: x.id, label: x.label }))} onOpen={remember} onPick={(v) => run('formatBlock', v, false)} className="ctb-style" />
          <Pick label="Font" options={FONTS.map((f) => ({ value: f, label: f }))} onOpen={remember} onPick={(v) => run('fontName', v)} className="ctb-font" />
          <Pick label="Size" options={SIZES.map((n) => ({ value: String(n), label: `${n}` }))} onOpen={remember} onPick={(v) => act((el) => setFontSize(el, Number(v)))} className="ctb-size" />
        </>
      ),
    },
    {
      id: 'marks',
      fold: 0,
      body: (
        <>
          <B label={`Bold (${combo('B')})`} on={state.bold} onClick={() => run('bold')}>
            <b>B</b>
          </B>
          <B label={`Italic (${combo('I')})`} on={state.italic} onClick={() => run('italic')}>
            <i>I</i>
          </B>
          <B label={`Underline (${combo('U')})`} on={state.underline} onClick={() => run('underline')}>
            <u>U</u>
          </B>
          <B label="Strikethrough" icon="strike" on={state.strike} onClick={() => run('strikeThrough')} />
          <B label="Text colour" icon="textColor" trigger onClick={(e) => open('colour', e)} />
          <B label="Highlight" icon="highlight" trigger onClick={(e) => open('highlight', e)} />
        </>
      ),
    },
    {
      id: 'align',
      fold: 3,
      body: (
        <>
          <B label="Align left" icon="alignLeft" on={state.align === 'left' && !state.rtl} onClick={() => run('justifyLeft')} />
          <B label="Center" icon="alignCenter" on={state.align === 'center'} onClick={() => run('justifyCenter')} />
          <B label="Align right" icon="alignRight" on={state.align === 'right'} onClick={() => run('justifyRight')} />
        </>
      ),
      menu: [
        { label: 'Align left', icon: 'alignLeft', on: state.align === 'left' && !state.rtl, run: () => run('justifyLeft') },
        { label: 'Center', icon: 'alignCenter', on: state.align === 'center', run: () => run('justifyCenter') },
        { label: 'Align right', icon: 'alignRight', on: state.align === 'right', run: () => run('justifyRight') },
      ],
    },
    {
      id: 'lists',
      fold: 5,
      body: (
        <>
          <B label="Bulleted list" icon="listBullet" on={state.ul} onClick={() => run('insertUnorderedList')} />
          <B label="Numbered list" icon="listNumber" on={state.ol} onClick={() => run('insertOrderedList')} />
        </>
      ),
      menu: [
        { label: 'Bulleted list', icon: 'listBullet', on: state.ul, run: () => run('insertUnorderedList') },
        { label: 'Numbered list', icon: 'listNumber', on: state.ol, run: () => run('insertOrderedList') },
      ],
    },
    {
      id: 'indent',
      fold: 1,
      body: (
        <>
          <B label="Decrease indent" icon="outdent" onClick={() => run('outdent')} />
          <B label="Increase indent" icon="indent" onClick={() => run('indent')} />
        </>
      ),
      menu: [
        { label: 'Decrease indent', icon: 'outdent', run: () => run('outdent') },
        { label: 'Increase indent', icon: 'indent', run: () => run('indent') },
      ],
    },
    {
      id: 'direction',
      fold: 2,
      body: (
        <>
          <B label="Left to right" icon="ltr" onClick={() => act((el) => setDirection(el, 'ltr'))} />
          <B label="Right to left (Arabic)" icon="rtl" on={state.rtl} onClick={() => act((el) => setDirection(el, 'rtl'))} />
        </>
      ),
      menu: [
        { label: 'Left to right', icon: 'ltr', run: () => act((el) => setDirection(el, 'ltr')) },
        { label: 'Right to left (Arabic)', icon: 'rtl', on: state.rtl, run: () => act((el) => setDirection(el, 'rtl')) },
      ],
    },
    {
      id: 'insert',
      fold: 6,
      body: (
        <>
          <B label={`Insert link (${combo('K')})`} icon="link" onClick={onLink} />
          <B label={state.inTable ? 'Table' : 'Insert table'} icon="table" on={state.inTable} trigger onClick={(e) => open(state.inTable ? 'tableEdit' : 'table', e)} />
          <B label="Insert picture" icon="image" onClick={() => picture.current?.click()} />
        </>
      ),
      menu: [
        { label: 'Insert link', icon: 'link', run: () => onLink() },
        { label: state.inTable ? 'Table' : 'Insert table', icon: 'table', on: state.inTable, run: (e) => openAtMore(state.inTable ? 'tableEdit' : 'table', e) },
        { label: 'Insert picture', icon: 'image', run: (e) => e.currentTarget.ownerDocument.getElementById(pictureId)?.click() },
      ],
    },
    {
      id: 'extras',
      fold: 1,
      body: (
        <>
          <B label="Horizontal line" icon="hrule" onClick={() => insert('insertHorizontalRule')} />
          <B label="Emoji" icon="emoji" trigger onClick={(e) => open('emoji', e)} />
          <B label="Clear formatting" icon="clearFormat" onClick={() => run('removeFormat')} />
        </>
      ),
      menu: [
        { label: 'Horizontal line', icon: 'hrule', run: () => insert('insertHorizontalRule') },
        { label: 'Emoji', icon: 'emoji', run: emojiAt },
        { label: 'Clear formatting', icon: 'clearFormat', run: () => run('removeFormat') },
      ],
    },
  ]
  // The groups hold click handlers that read the editor's refs when clicked, never while drawing (the linter cannot tell).
  // oxlint-disable-next-line react/refs
  const folded = groups.filter((g) => hidden.includes(g.id))

  return (
    <>
      <div className="ctb-row" ref={row} id={moreId}>
        {/* oxlint-disable-next-line react/refs */}
        {groups.map((g, i) => (
          <div key={g.id} className="ctb-group" data-group={g.id} data-fold={g.fold} hidden={hidden.includes(g.id)}>
            {groups.slice(0, i).some((x) => !hidden.includes(x.id)) && <span className="fsep" aria-hidden="true" />}
            {g.body}
          </div>
        ))}
        {folded.length > 0 && (
          <div className="ctb-group">
            <span className="fsep" aria-hidden="true" />
            <span className="ctb-more"><B label="More formatting" icon="more" trigger on={pop?.kind === 'more'} onClick={(e) => open('more', e)} /></span>
          </div>
        )}
      </div>
      <input
        ref={picture}
        id={pictureId}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        hidden
        aria-label="Insert picture file"
        onChange={(e) => {
          if (e.target.files?.length) {
            restore()
            document.getSelection()?.collapseToEnd()
            onPictures(Array.from(e.target.files))
          }
          e.target.value = ''
        }}
      />
      {pop &&
        createPortal(
          <div key={`${pop.kind}-${pop.x}-${pop.y}`} ref={placePop} className="ctx att-ctx ctb-pop" role="menu" style={{ left: pop.x, top: pop.y, maxHeight: 'calc(100vh - 16px)', overflowY: 'auto' }}>
            {(pop.kind === 'colour' || pop.kind === 'highlight') && (
              <div className="ctb-swatches" aria-label={pop.kind === 'colour' ? 'Text colour' : 'Highlight'}>
                {(pop.kind === 'colour' ? COLOURS : HIGHLIGHTS).map((c) => (
                  <button
                    key={c}
                    type="button"
                    role="menuitem"
                    className="ctb-swatch"
                    style={{ background: c }}
                    aria-label={c}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      run(pop.kind === 'colour' ? 'foreColor' : 'hiliteColor', c)
                      setPop(null)
                    }}
                  />
                ))}
                <button
                  type="button"
                  role="menuitem"
                  className="ctb-none"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    run(pop.kind === 'colour' ? 'foreColor' : 'hiliteColor', pop.kind === 'colour' ? '#000000' : 'transparent')
                    setPop(null)
                  }}
                >
                  {pop.kind === 'colour' ? 'Automatic' : 'No highlight'}
                </button>
              </div>
            )}
            {pop.kind === 'table' && (
              <div className="ctb-grid-wrap">
                <div className="ctb-grid" onMouseLeave={() => setGrid({ r: 3, c: 3 })}>
                  {Array.from({ length: 8 * 8 }, (_, i) => {
                    const r = Math.floor(i / 8) + 1
                    const c = (i % 8) + 1
                    return (
                      <button
                        key={i}
                        type="button"
                        aria-label={`${r} by ${c} table`}
                        className={r <= grid.r && c <= grid.c ? 'on' : ''}
                        onMouseEnter={() => setGrid({ r, c })}
                        onFocus={() => setGrid({ r, c })}
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          insert('insertHTML', tableHtml(r, c))
                          setPop(null)
                        }}
                      />
                    )
                  })}
                </div>
                <p className="ctb-grid-label">
                  {grid.r} × {grid.c} table
                </p>
              </div>
            )}
            {pop.kind === 'tableEdit' &&
              tableActs.map((t) => (
                <button
                  key={t.a}
                  type="button"
                  role="menuitem"
                  className="ctx-item"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    act((el) => tableAction(el, t.a))
                    setPop(null)
                  }}
                >
                  {t.label}
                </button>
              ))}
            {pop.kind === 'more' &&
              folded.map((g, gi) => (
                <div key={g.id} className="ctb-more-group" role="group">
                  {gi > 0 && <div className="ctb-more-sep" />}
                  {g.menuBody && <div className="ctb-more-lists">{g.menuBody}</div>}
                  {(g.menu ?? []).map((it) => (
                    <button key={it.label} type="button" role="menuitem" className={`ctx-item ctb-more-item${it.on ? ' on' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={fromMenu(it)}>
                      <Icon name={it.icon} size={16} />
                      <span>{it.label}</span>
                      {it.on && <Icon name="check" size={14} />}
                    </button>
                  ))}
                </div>
              ))}
            {pop.kind === 'emoji' && (
              <div className="ctb-emoji">
                {EMOJI.map((g) => (
                  <section key={g.name} aria-label={g.name}>
                    <h4>{g.name}</h4>
                    <div>
                      {g.list.split(' ').map((em) => (
                        <button
                          key={em}
                          type="button"
                          role="menuitem"
                          aria-label={em}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => {
                            insert('insertText', em)
                          }}
                        >
                          {em}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  )
}
