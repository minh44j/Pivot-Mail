/**
 * Keyboard shortcuts, modelled on Outlook. This list drives the help dialog;
 * the key handling itself lives in App.tsx (list), Composer.tsx (writing) and Toolbar.tsx (search).
 *
 * Browser limits (web version): Ctrl+N, Ctrl+T and Ctrl+W are reserved by the browser and cannot be
 * overridden, so New message also answers to N and Ctrl+Shift+M. The desktop wrapper removes this limit.
 */

export const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
export const MOD = isMac ? '⌘' : 'Ctrl'

export interface ShortcutItem {
  /** Alternatives, e.g. ['Ctrl+F', 'Ctrl+E']. "Ctrl" shows as ⌘ on Mac (⌘ or Control both work). */
  keys: string[]
  desc: string
}

export interface ShortcutGroup {
  group: string
  items: ShortcutItem[]
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    group: 'Search and go to',
    items: [
      { keys: ['Ctrl+F', 'Ctrl+E', 'F3', '/'], desc: 'Search mail' },
      { keys: ['Esc'], desc: 'Clear search, then return to the list' },
      { keys: ['↓'], desc: 'From the search box, jump to the results' },
      { keys: ['Ctrl+Y', 'Ctrl+G'], desc: 'Go to folder' },
      { keys: ['Ctrl+Shift+I'], desc: 'Go to Inbox' },
      { keys: ['F9'], desc: 'Send / receive (sync now)' },
      { keys: ['Ctrl+,'], desc: 'Settings' },
      { keys: ['Ctrl+/', 'F1', '?'], desc: 'Show keyboard shortcuts' },
    ],
  },
  {
    group: 'Message list',
    items: [
      { keys: ['↓', 'J'], desc: 'Next message' },
      { keys: ['↑', 'K'], desc: 'Previous message' },
      { keys: ['Home', 'End'], desc: 'First or last message' },
      { keys: ['Page Up', 'Page Down'], desc: 'Up or down 10 messages' },
      { keys: ['Enter'], desc: 'Move to the reading pane (arrow keys then scroll it)' },
      { keys: ['Ctrl+Click', 'Shift+Click'], desc: 'Select several conversations (or use the checkboxes)' },
      { keys: ['Shift+↓', 'Shift+↑'], desc: 'Extend the selection' },
      { keys: ['Ctrl+A'], desc: 'Select all conversations in the list' },
      { keys: ['Delete', 'Ctrl+D'], desc: 'Delete' },
      { keys: ['Backspace', 'E'], desc: 'Archive' },
      { keys: ['Ctrl+C'], desc: 'Copy the selected email (paste it into a message with Ctrl+V)' },
      { keys: ['Ctrl+Z'], desc: 'Undo the last action' },
      { keys: ['Ctrl+Shift+V'], desc: 'Move to folder' },
    ],
  },
  {
    group: 'Mark and organise',
    items: [
      { keys: ['Ctrl+Q'], desc: 'Mark as read' },
      { keys: ['Ctrl+U'], desc: 'Mark as unread' },
      { keys: ['Insert'], desc: 'Flag for follow up, or remove' },
      { keys: ['Ctrl+Shift+1'], desc: 'Mark as important, or remove' },
      { keys: ['Ctrl+Alt+1…6'], desc: 'Apply colour category 1 to 6' },
      { keys: ['Ctrl+Alt+0'], desc: 'Clear colour category' },
    ],
  },
  {
    group: 'Respond and create',
    items: [
      { keys: ['N', 'Ctrl+N', 'Ctrl+Shift+M'], desc: 'New message' },
      { keys: ['Ctrl+R'], desc: 'Reply' },
      { keys: ['Ctrl+Shift+R'], desc: 'Reply all' },
      { keys: ['Ctrl+J'], desc: 'Forward (Ctrl+F is search here)' },
    ],
  },
  {
    group: 'Writing a message',
    items: [
      { keys: ['Ctrl+Enter', 'Alt+S'], desc: 'Send' },
      { keys: ['Ctrl+S'], desc: 'Save draft' },
      { keys: ['Esc'], desc: 'Close (the draft is kept)' },
      { keys: ['Ctrl+B', 'Ctrl+I', 'Ctrl+U'], desc: 'Bold, italic, underline' },
      { keys: ['Ctrl+K'], desc: 'Insert link' },
      { keys: ['Ctrl+Shift+L'], desc: 'Bulleted list' },
      { keys: ['Ctrl+Z', 'Ctrl+Y'], desc: 'Undo, redo while typing' },
    ],
  },
]

/** Human-readable key label for this platform. */
export function fmtKey(k: string): string {
  if (!isMac) return k
  return k.replace('Ctrl', '⌘').replace('Alt', '⌥').replace('Shift', '⇧').replace('Backspace', '⌫').replace('Delete', '⌦').replace('Enter', '↩')
}
