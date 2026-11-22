/**
 * Editing operations of the writing toolbar that the browser has no single command for: text direction (Arabic), tables
 * (insert, add or remove rows and columns) and exact font sizes. They work on the editor's own DOM; the caller saves the
 * result (Composer's sync()).
 */

const BLOCKS = 'p, div, li, h1, h2, h3, h4, blockquote, pre, td, th'

/** The innermost text blocks the selection touches (never the signature or the quoted mail). */
export function blocksInSelection(editor: HTMLElement): HTMLElement[] {
  const sel = document.getSelection()
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return []
  const range = sel.getRangeAt(0)
  const all = Array.from(editor.querySelectorAll<HTMLElement>(BLOCKS)).filter((b) => range.intersectsNode(b) && !b.closest('[data-sig], [data-quote]'))
  // Innermost only: a block holding another touched block is the other one's container.
  const inner = all.filter((b) => !all.some((o) => o !== b && b.contains(o)))
  if (inner.length > 0) return inner
  const host = range.startContainer.nodeType === Node.TEXT_NODE ? range.startContainer.parentElement : (range.startContainer as HTMLElement)
  const own = host?.closest<HTMLElement>(BLOCKS)
  return own && own !== editor && editor.contains(own) ? [own] : []
}

/** Right-to-left (Arabic) or left-to-right for the paragraphs the selection touches. */
export function setDirection(editor: HTMLElement, dir: 'rtl' | 'ltr'): void {
  let blocks = blocksInSelection(editor)
  if (blocks.length === 0) {
    // Text straight in the editor (no paragraph yet): make the current line a paragraph first.
    document.execCommand('formatBlock', false, 'div')
    blocks = blocksInSelection(editor)
  }
  for (const b of blocks) {
    b.setAttribute('dir', dir)
    if (dir === 'rtl') b.style.textAlign = 'right'
    else if (b.style.textAlign === 'right') b.style.textAlign = ''
    if (!b.getAttribute('style')) b.removeAttribute('style')
  }
}

/** The paragraph direction at the caret (to show the button as pressed). */
export function directionAtCaret(editor: HTMLElement): 'rtl' | 'ltr' {
  const b = blocksInSelection(editor)[0]
  return b?.closest('[dir]')?.getAttribute('dir') === 'rtl' ? 'rtl' : 'ltr'
}

const CELL_STYLE = 'border: 1px solid #b4b4b4; padding: 4px 8px; min-width: 48px; vertical-align: top'

/** A new table, rows x columns, with visible borders; a line after it so writing can go on below. */
export function tableHtml(rows: number, cols: number): string {
  const r = Math.max(1, Math.min(20, rows))
  const c = Math.max(1, Math.min(10, cols))
  const row = `<tr>${`<td style="${CELL_STYLE}"><br></td>`.repeat(c)}</tr>`
  return `<table style="border-collapse: collapse; width: 100%"><tbody>${row.repeat(r)}</tbody></table><div><br></div>`
}

/** The table cell at the caret, if any. */
export function cellAtCaret(editor: HTMLElement): HTMLTableCellElement | null {
  const sel = document.getSelection()
  const n = sel?.anchorNode
  if (!n || !editor.contains(n)) return null
  const el = n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as HTMLElement)
  const cell = el?.closest<HTMLTableCellElement>('td, th')
  return cell && editor.contains(cell) && !cell.closest('[data-sig], [data-quote]') ? cell : null
}

const emptyLike = (cell: Element): HTMLTableCellElement => {
  const c = document.createElement(cell.tagName.toLowerCase() as 'td') as HTMLTableCellElement
  const s = cell.getAttribute('style')
  if (s) c.setAttribute('style', s)
  c.innerHTML = '<br>'
  return c
}

const placeCaret = (node: Node) => {
  const r = document.createRange()
  r.selectNodeContents(node)
  r.collapse(true)
  const sel = document.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(r)
}

export type TableAction = 'rowAbove' | 'rowBelow' | 'colLeft' | 'colRight' | 'delRow' | 'delCol' | 'delTable'

/** Adds or removes a row or column of the table at the caret (simple tables: one cell per column). */
export function tableAction(editor: HTMLElement, action: TableAction): boolean {
  const cell = cellAtCaret(editor)
  if (!cell) return false
  const row = cell.parentElement as HTMLTableRowElement
  const table = cell.closest('table') as HTMLTableElement
  const col = cell.cellIndex
  const rows = Array.from(table.rows)
  switch (action) {
    case 'rowAbove':
    case 'rowBelow': {
      const fresh = document.createElement('tr')
      for (const c of Array.from(row.cells)) fresh.append(emptyLike(c))
      if (action === 'rowAbove') row.before(fresh)
      else row.after(fresh)
      if (fresh.cells[col]) placeCaret(fresh.cells[col])
      return true
    }
    case 'colLeft':
    case 'colRight':
      for (const r of rows) {
        const ref = r.cells[Math.min(col, r.cells.length - 1)]
        if (!ref) continue
        const c = emptyLike(ref)
        if (action === 'colLeft') ref.before(c)
        else ref.after(c)
      }
      return true
    case 'delRow': {
      const next = row.nextElementSibling ?? row.previousElementSibling
      row.remove()
      if (table.rows.length === 0) table.remove()
      else if (next) placeCaret((next as HTMLTableRowElement).cells[Math.min(col, (next as HTMLTableRowElement).cells.length - 1)] ?? next)
      return true
    }
    case 'delCol':
      for (const r of rows) r.cells[Math.min(col, r.cells.length - 1)]?.remove()
      if (Array.from(table.rows).every((r) => r.cells.length === 0)) table.remove()
      return true
    case 'delTable': {
      const after = table.nextSibling
      table.remove()
      if (after) placeCaret(after)
      return true
    }
  }
}

/**
 * Font size in points for the selection. The browser's own command only knows sizes 1 to 7; it marks the text with size 7
 * and each mark is then given the exact size.
 */
export function setFontSize(editor: HTMLElement, pt: number): void {
  document.execCommand('styleWithCSS', false, 'false')
  document.execCommand('fontSize', false, '7')
  const made: HTMLElement[] = []
  for (const f of Array.from(editor.querySelectorAll('font[size="7"]'))) {
    const span = document.createElement('span')
    span.style.fontSize = `${pt}pt`
    span.append(...Array.from(f.childNodes))
    f.replaceWith(span)
    made.push(span)
  }
  // With styled marks the browser writes "xxx-large" instead.
  for (const s of Array.from(editor.querySelectorAll<HTMLElement>('span[style*="xxx-large"]'))) {
    s.style.fontSize = `${pt}pt`
    made.push(s)
  }
  // The same text stays selected, so a font or colour picked next applies to it too.
  const first = made[0]
  const last = made[made.length - 1]
  if (first && last) {
    const r = document.createRange()
    r.setStartBefore(first)
    r.setEndAfter(last)
    const sel = document.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
  }
}
