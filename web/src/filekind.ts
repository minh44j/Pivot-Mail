export type FileKind = 'pdf' | 'excel' | 'word' | 'powerpoint' | 'html' | 'image' | 'archive' | 'text' | 'email' | 'other'

export interface FileKindInfo {
  kind: FileKind
  label: string
  color: string
}

/**
 * File type by extension, then MIME type. The icons are original, drawn in code, using the usual
 * colour conventions (green spreadsheet, blue document, red PDF). They are not the vendors' logos.
 */
export function fileKind(name: string, mime = ''): FileKindInfo {
  const ext = (name.split('.').pop() ?? '').toLowerCase()
  const m = mime.toLowerCase()
  if (ext === 'pdf' || m === 'application/pdf') return { kind: 'pdf', label: 'PDF document', color: '#d92d20' }
  if (['xls', 'xlsx', 'xlsm', 'csv', 'ods'].includes(ext) || m.includes('spreadsheet') || m.includes('ms-excel')) return { kind: 'excel', label: 'Spreadsheet', color: '#1d7a46' }
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext) || m.includes('wordprocessing') || m === 'application/msword') return { kind: 'word', label: 'Word document', color: '#2b5fb4' }
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext) || m.includes('presentation') || m.includes('powerpoint')) return { kind: 'powerpoint', label: 'Presentation', color: '#c43e1c' }
  if (['html', 'htm', 'xhtml'].includes(ext) || m === 'text/html') return { kind: 'html', label: 'HTML file', color: '#e8590c' }
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic', 'tif', 'tiff'].includes(ext) || m.startsWith('image/')) return { kind: 'image', label: 'Image', color: '#8e4ec6' }
  if (['zip', 'rar', '7z', 'gz', 'tar'].includes(ext) || m.includes('zip')) return { kind: 'archive', label: 'Archive', color: '#7a6a55' }
  if (['txt', 'log', 'md', 'json', 'xml'].includes(ext) || m === 'text/plain') return { kind: 'text', label: 'Text file', color: '#6b7280' }
  if (['eml', 'msg'].includes(ext) || m === 'message/rfc822') return { kind: 'email', label: 'Email message', color: '#2f6fd6' }
  return { kind: 'other', label: 'File', color: '#6b7280' }
}
