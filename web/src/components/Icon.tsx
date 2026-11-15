const PATHS = {
  compose: 'M12 20h9|M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z',
  trash: 'M4 7h16|M10 11v6|M14 11v6|M6 7l1 13h10l1-13|M9 7V4h6v3',
  archive: 'M3 4h18v4H3z|M5 8v12h14V8|M10 12h4',
  reply: 'M9 14L4 9l5-5|M4 9h10a6 6 0 016 6v3',
  replyAll: 'M7 14L2 9l5-5|M12 14L7 9l5-5|M7 9h8a6 6 0 016 6v3',
  forward: 'M15 14l5-5-5-5|M20 9H10a6 6 0 00-6 6v3',
  tag: 'M3 12V4h8l10 10-8 8z|M7.5 8.5h.01',
  flag: 'M5 21V4|M5 4h13l-2 4 2 4H5',
  clip: 'M20 11l-8.5 8.5a5 5 0 01-7-7L13 4a3.5 3.5 0 015 5l-8.5 8.5a2 2 0 01-3-3L14 7',
  search: 'M11 4a7 7 0 100 14 7 7 0 000-14z|M21 21l-5-5',
  inbox: 'M3 13l3-8h12l3 8|M3 13v6h18v-6|M3 13h5l1 3h6l1-3h5',
  send: 'M3 11l18-8-8 18-2-8z',
  draft: 'M6 3h9l4 4v14H6z|M14 3v5h5',
  chevron: 'M6 9l6 6 6-6',
  back: 'M15 5l-7 7 7 7',
  close: 'M6 6l12 12|M18 6L6 18',
  template: 'M4 4h16v6H4z|M4 14h7v6H4z|M15 14h5|M15 18h5',
  check: 'M5 12l5 5 9-10',
  users: 'M9 11a3 3 0 100-6 3 3 0 000 6z|M3 20a6 6 0 0112 0|M16 5a3 3 0 010 6|M18 14a6 6 0 013 6',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z|M12 15a3 3 0 100-6 3 3 0 000 6z',
  folder: 'M3 6h7l2 2h9v11H3z',
  download: 'M12 4v12|M7 11l5 5 5-5|M4 20h16',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4z|M10 21h4',
  layout: 'M3 4h18v16H3z|M9 4v16',
  threads: 'M4 6h16|M4 12h12|M4 18h8',
  menu: 'M4 6h16|M4 12h16|M4 18h16',
  lock: 'M6 11h12v9H6z|M8 11V8a4 4 0 018 0v3',
  listBullet: 'M9 6h11|M9 12h11|M9 18h11|M4 6h.01|M4 12h.01|M4 18h.01',
  listNumber: 'M10 6h10|M10 12h10|M10 18h10|M4 4v4|M3 8h2|M3 14h3l-3 4h3',
  link: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1|M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  clearFormat: 'M7 4h12|M13 4l-3 7|M4 20L20 4|M10 14l-1 6',
  more: 'M5 12h.01|M12 12h.01|M19 12h.01',
  hash: 'M5 9h14|M5 15h14|M10 4L8 20|M16 4l-2 16',
  expand: 'M15 3h6v6|M9 21H3v-6|M21 3l-7 7|M3 21l7-7',
  collapse: 'M4 14h6v6|M20 10h-6V4|M14 10l7-7|M3 21l7-7',
} as const

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 18 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name].split('|').map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  )
}
