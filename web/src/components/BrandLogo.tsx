import mark from '../assets/brand/pivot-mark-sm.png'

/**
 * The Pivot chrome mark on a dark rounded square (the same tile as the app icon, and as Pivot OS), with the "Pivot Mail" wordmark.
 * `size` sm = top bar, lg = sign-in. `tone` light = text for a dark/blue bar.
 */
export function BrandLogo({ size = 'sm', tone = 'dark', word = true }: { size?: 'sm' | 'lg'; tone?: 'dark' | 'light'; word?: boolean }) {
  return (
    <span className={`brand brand-${size} brand-${tone}`}>
      <span className="brand-tile" aria-hidden="true">
        <img src={mark} alt="" width={64} height={64} draggable={false} />
      </span>
      {word ? (
        <span className="brand-word">
          <b>Pivot</b> <span>Mail</span>
        </span>
      ) : null}
      <span className="sr-only">Pivot Mail</span>
    </span>
  )
}
