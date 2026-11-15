import { fileKind } from '../filekind'
import type { FileKind } from '../filekind'

const GLYPH: Record<FileKind, string[]> = {
  pdf: [],
  excel: ['M7 15h14v10H7z', 'M7 20h14', 'M14 15v10'],
  word: ['M8 16h12', 'M8 20h12', 'M8 24h8'],
  powerpoint: ['M9 25v-4', 'M14 25v-8', 'M19 25v-6'],
  html: ['M12 16l-4 4 4 4', 'M16 16l4 4-4 4'],
  image: ['M7 25l5-7 4 5 3-3 4 5z'],
  archive: ['M14 12v3', 'M14 18v3', 'M12 15h4', 'M12 21h4', 'M12 24h4'],
  text: ['M8 16h12', 'M8 20h12', 'M8 24h12'],
  email: ['M7 16h14v9H7z', 'M7 16l7 6 7-6'],
  other: [],
}

/** Document-type icon: coloured page with a glyph for the type. */
export function FileIcon({ name, mime, size = 28 }: { name: string; mime?: string; size?: number }) {
  const info = fileKind(name, mime)
  return (
    <svg className="file-icon" width={size} height={(size * 34) / 28} viewBox="0 0 28 34" aria-hidden="true" focusable="false">
      <path d="M4 1h13l8 8v22a2 2 0 01-2 2H4a2 2 0 01-2-2V3a2 2 0 012-2z" fill={info.color} />
      <path d="M17 1v6a2 2 0 002 2h6z" fill="#fff" opacity="0.35" />
      {info.kind === 'pdf' && (
        <text x="14" y="26" textAnchor="middle" fontSize="8" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">
          PDF
        </text>
      )}
      {info.kind === 'image' && <circle cx="20" cy="15" r="2" fill="#fff" />}
      <g fill={info.kind === 'image' ? '#fff' : 'none'} stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        {GLYPH[info.kind].map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
    </svg>
  )
}
