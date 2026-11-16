import { useEffect } from 'react'
import { SHORTCUTS, fmtKey, isMac } from '../shortcuts'
import { Icon } from './Icon'

export function ShortcutHelp({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal wide" role="dialog" aria-modal="true" aria-labelledby="sc-title">
        <div className="modal-head">
          <h2 id="sc-title">Keyboard shortcuts</h2>
          <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onClose} aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="sc-body" tabIndex={0} role="region" aria-label="Keyboard shortcut list">
          {SHORTCUTS.map((g) => (
            <section key={g.group} className="sc-group" aria-label={`${g.group} shortcuts`}>
              <h3>{g.group}</h3>
              <dl>
                {g.items.map((it) => (
                  <div key={it.desc} className="sc-row">
                    <dt>
                      {it.keys.map((k, i) => (
                        <span key={k}>
                          {i > 0 && <span className="sc-or"> or </span>}
                          <kbd>{fmtKey(k)}</kbd>
                        </span>
                      ))}
                    </dt>
                    <dd>{it.desc}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
          <p className="muted sc-foot">
            {isMac ? '⌘ or Control both work.' : 'On Mac, ⌘ works in place of Ctrl.'} The browser keeps Ctrl+N, Ctrl+T and Ctrl+W, so use N or Ctrl+Shift+M for a new message. Ctrl+Shift+I may open developer tools in some browsers.
          </p>
        </div>
      </div>
    </div>
  )
}
