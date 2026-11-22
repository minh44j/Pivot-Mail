import { useEffect, useRef, useState } from 'react'
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

type Pop = 'colour' | 'highlight' | 'table' | 'emoji' | 'tableEdit' | null

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
    <label className={`fchip ctb-select ${className}`}>
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
    </label>
  )
}

export function ComposeToolbar({ editor, onChange, onLink, onPictures }: Props) {
  const saved = useRef<Range | null>(null)
  const picture = useRef<HTMLInputElement>(null)
  const [pop, setPop] = useState<{ kind: Pop; x: number; y: number } | null>(null)
  const [grid, setGrid] = useState({ r: 3, c: 3 })
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

  return (
    <>
      <B label={`Undo (${combo('Z')})`} icon="undo" onClick={() => run('undo')} />
      <B label="Redo" icon="redo" onClick={() => run('redo')} />
      <span className="fsep" />
      <Pick label="Style" options={STYLES.map((x) => ({ value: x.id, label: x.label }))} onOpen={remember} onPick={(v) => run('formatBlock', v, false)} className="ctb-style" />
      <Pick label="Font" options={FONTS.map((f) => ({ value: f, label: f }))} onOpen={remember} onPick={(v) => run('fontName', v)} />
      <Pick label="Size" options={SIZES.map((n) => ({ value: String(n), label: `${n}` }))} onOpen={remember} onPick={(v) => act((el) => setFontSize(el, Number(v)))} className="ctb-size" />
      <span className="fsep" />
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
      <span className="fsep" />
      <B label="Align left" icon="alignLeft" on={state.align === 'left' && !state.rtl} onClick={() => run('justifyLeft')} />
      <B label="Center" icon="alignCenter" on={state.align === 'center'} onClick={() => run('justifyCenter')} />
      <B label="Align right" icon="alignRight" on={state.align === 'right'} onClick={() => run('justifyRight')} />
      <B label="Decrease indent" icon="outdent" onClick={() => run('outdent')} />
      <B label="Increase indent" icon="indent" onClick={() => run('indent')} />
      <B label="Left to right" icon="ltr" on={!state.rtl} onClick={() => act((el) => setDirection(el, 'ltr'))} />
      <B label="Right to left (Arabic)" icon="rtl" on={state.rtl} onClick={() => act((el) => setDirection(el, 'rtl'))} />
      <span className="fsep" />
      <B label="Bulleted list" icon="listBullet" on={state.ul} onClick={() => run('insertUnorderedList')} />
      <B label="Numbered list" icon="listNumber" on={state.ol} onClick={() => run('insertOrderedList')} />
      <span className="fsep" />
      <B label={`Insert link (${combo('K')})`} icon="link" onClick={onLink} />
      <B label={state.inTable ? 'Table' : 'Insert table'} icon="table" on={state.inTable} trigger onClick={(e) => open(state.inTable ? 'tableEdit' : 'table', e)} />
      <B label="Insert picture" icon="image" onClick={() => picture.current?.click()} />
      <B label="Horizontal line" icon="hrule" onClick={() => insert('insertHorizontalRule')} />
      <B label="Emoji" icon="emoji" trigger onClick={(e) => open('emoji', e)} />
      <B label="Clear formatting" icon="clearFormat" onClick={() => run('removeFormat')} />
      <input
        ref={picture}
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
          <div className="ctx att-ctx ctb-pop" role="menu" style={{ left: pop.x, top: pop.y }}>
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
