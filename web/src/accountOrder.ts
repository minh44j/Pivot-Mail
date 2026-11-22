/**
 * The order of the mailboxes in the sidebar, chosen by dragging (Minhaj 2026-11-22). Kept on this computer as the mailbox ids
 * in order; a mailbox added later goes to the end, one removed simply drops out.
 */

/** The list in the person's order (mailboxes not placed yet keep their usual order, after the placed ones). */
export function inOrder<T extends { id: string }>(list: readonly T[], order: readonly string[]): T[] {
  const at = new Map(order.map((id, i) => [id, i]))
  return list
    .map((x, i) => ({ x, i, k: at.get(x.id) ?? order.length + i }))
    .sort((a, b) => a.k - b.k)
    .map((e) => e.x)
}

/** The new order after dropping `moving` just before `before` (null: at the end). */
export function moveBefore(ids: readonly string[], moving: string, before: string | null): string[] {
  if (moving === before) return [...ids]
  const rest = ids.filter((id) => id !== moving)
  const i = before === null ? -1 : rest.indexOf(before)
  if (i < 0) return [...rest, moving]
  return [...rest.slice(0, i), moving, ...rest.slice(i)]
}
