/**
 * Files pasted into the mail being written become attachments, as in Outlook (Minhaj, 2026-11-22): copy files in File
 * Explorer or Finder, press Ctrl+V / ⌘V in the compose window. Before, the paste kept only the clipboard's text, so copied
 * files did nothing (Windows) or pasted their file names (Mac, where Finder also puts the names on the clipboard as text).
 */

/** The clipboard parts the rule looks at (a DataTransfer, or a stand-in in tests). */
export interface PasteData {
  readonly types: readonly string[]
  readonly files: ArrayLike<File>
  getData(format: string): string
}

/**
 * The files to attach from a paste, or null when the paste is text.
 *
 * Copying cells in Excel, text in Word or part of a web page ALSO puts a picture of that selection on the clipboard (next to
 * its text and formatting). That must stay a text paste: attaching a screenshot of the cells instead of pasting them would be
 * wrong. So pictures that arrive WITH formatted text are left out; pictures alone (a screenshot, an image file copied in
 * Explorer or Finder) and every other kind of file are attached.
 */
export function filesFromPaste(data: PasteData | null | undefined): File[] | null {
  if (!data) return null
  const files = Array.from(data.files ?? [])
  if (files.length === 0) return null
  const formatted = data.types.includes('text/html') || data.types.includes('text/rtf')
  const onlyPictures = files.every((f) => f.type.startsWith('image/'))
  if (formatted && onlyPictures && data.getData('text/plain').trim() !== '') return null
  return files
}

/**
 * Keeps the files that can actually be read. A folder copied in Explorer or Finder arrives as an entry that cannot be read
 * (it would be sent as a broken, empty attachment), so it is left out and counted.
 */
export async function readableFiles(files: readonly File[]): Promise<{ ok: File[]; folders: number }> {
  const checks = await Promise.all(
    files.map((f) =>
      f
        .slice(0, 1)
        .arrayBuffer()
        .then(() => true)
        .catch(() => false),
    ),
  )
  return { ok: files.filter((_, i) => checks[i]), folders: checks.filter((c) => !c).length }
}
