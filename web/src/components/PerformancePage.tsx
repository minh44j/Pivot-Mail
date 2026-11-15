import { useMemo, useState } from 'react'
import { STAFF, aggregate, buildDays, csvCell, fmtClock, fmtDuration } from '../data/performance'
import type { Aggregate, DayStat, StaffMember } from '../data/performance'
import { initials } from '../util'
import logoLockup from '../assets/brand/logo-lockup.png'
import { Icon } from './Icon'

type Range = 1 | 7 | 30
type SortKey = 'name' | 'sent' | 'received' | 'cases' | 'avgActiveMin' | 'avgFirst' | 'avgLast' | 'activeDays'

interface Props {
  role: 'admin' | 'staff'
  onBack: () => void
  onToast: (m: string) => void
}

const RANGES: { id: Range; label: string; prev: string }[] = [
  { id: 1, label: 'Today', prev: 'yesterday' },
  { id: 7, label: '7 days', prev: 'previous 7 days' },
  { id: 30, label: '30 days', prev: 'previous 30 days' },
]

function dayLabel(iso: string, long = false): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y as number, (m as number) - 1, d as number).toLocaleDateString([], long ? { weekday: 'short', day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short' })
}

function niceMax(v: number): number {
  if (v <= 0) return 1
  const pow = Math.pow(10, Math.floor(Math.log10(v)))
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow
  return 10 * pow
}

/* ---------- stat tile ---------- */
function Tile(props: { label: string; value: string; delta: string | null; note?: string }) {
  return (
    <div className="tile">
      <div className="tile-label">{props.label}</div>
      <div className="tile-value">{props.value}</div>
      {props.delta && <div className="tile-delta">{props.delta}</div>}
      {props.note && <div className="tile-note">{props.note}</div>}
    </div>
  )
}

function delta(cur: number, prev: number, label: string): string | null {
  if (prev <= 0) return null
  const pct = Math.round(((cur - prev) / prev) * 100)
  if (pct === 0) return `No change vs ${label}`
  return `${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}% vs ${label}`
}

/* ---------- column chart (grouped, thin bars, 2px gaps, 4px rounded tips) ---------- */
interface Series {
  key: string
  label: string
  cssVar: string
}

function ColumnChart(props: { title: string; days: DayStat[]; series: Series[]; valueOf: (d: DayStat, key: string) => number; format: (v: number) => string; axisFormat: (v: number) => string }) {
  const { days, series, valueOf } = props
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 220
  const padL = 40
  const padR = 8
  const padT = 10
  const padB = 26
  const plotW = W - padL - padR
  const plotH = H - padT - padB
  const rawMax = Math.max(0, ...days.flatMap((d) => series.map((s) => valueOf(d, s.key))))
  const max = niceMax(rawMax)
  const band = plotW / Math.max(1, days.length)
  const n = series.length
  const barW = Math.max(3, Math.min(24, (band * 0.8 - 2 * (n - 1)) / n))
  const groupW = n * barW + 2 * (n - 1)
  const base = padT + plotH
  const y = (v: number): number => base - (v / max) * plotH
  const every = Math.max(1, Math.ceil(days.length / 8))
  const ticks = [0, max / 2, max]

  const bar = (x: number, v: number): string => {
    const h = base - y(v)
    if (h < 1) return ''
    const r = Math.min(4, h, barW / 2)
    return `M${x} ${base}V${base - h + r}a${r} ${r} 0 0 1 ${r} ${-r}h${barW - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}V${base}Z`
  }

  const hovered = hover !== null ? days[hover] : undefined
  const tipLeft = hover !== null ? Math.min(88, Math.max(12, ((padL + band * hover + band / 2) / W) * 100)) : 0

  return (
    <figure className="chart">
      <figcaption>
        <strong>{props.title}</strong>
        {series.length >= 2 && (
          <span className="legend" aria-label="Legend">
            {series.map((s) => (
              <span key={s.key} className="legend-item">
                <i className="swatch-key" style={{ background: `var(${s.cssVar})` }} />
                {s.label}
              </span>
            ))}
          </span>
        )}
      </figcaption>
      <div className="chart-wrap">
        <svg viewBox={`0 0 ${W} ${H}`} role="group" aria-label={props.title} onPointerLeave={() => setHover(null)}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} className="grid" />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="axis">
                {props.axisFormat(t)}
              </text>
            </g>
          ))}
          {days.map((d, i) => {
            const x0 = padL + band * i + (band - groupW) / 2
            return (
              <g key={d.date}>
                {hover === i && <rect x={padL + band * i} y={padT} width={band} height={plotH} className="hover-band" />}
                {series.map((s, k) => (
                  <path key={s.key} d={bar(x0 + k * (barW + 2), valueOf(d, s.key))} fill={`var(${s.cssVar})`} />
                ))}
                {i % every === 0 && (
                  <text x={padL + band * i + band / 2} y={H - 8} textAnchor="middle" className="axis">
                    {dayLabel(d.date)}
                  </text>
                )}
                <rect
                  x={padL + band * i}
                  y={padT}
                  width={band}
                  height={plotH}
                  fill="transparent"
                  tabIndex={0}
                  aria-label={`${dayLabel(d.date, true)}: ${series.map((s) => `${s.label} ${props.format(valueOf(d, s.key))}`).join(', ')}`}
                  onPointerMove={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  onBlur={() => setHover(null)}
                />
              </g>
            )
          })}
        </svg>
        {hovered && (
          <div className="tip" style={{ left: `${tipLeft}%` }} role="status">
            <div className="tip-date">{dayLabel(hovered.date, true)}</div>
            {series.map((s) => (
              <div key={s.key} className="tip-row">
                <i className="line-key" style={{ background: `var(${s.cssVar})` }} />
                <strong>{props.format(valueOf(hovered, s.key))}</strong>
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </figure>
  )
}

/** Days [now - from, now - to) of a person's 60-day history. */
function windowOf(all: Map<string, DayStat[]>, id: string, from: number, to: number): DayStat[] {
  return (all.get(id) ?? []).slice(60 - from, 60 - to)
}

/* ---------- page ---------- */
interface Row {
  staff: StaffMember
  agg: Aggregate
}

export function PerformancePage({ role, onBack, onToast }: Props) {
  const [range, setRange] = useState<Range>(7)
  const [sortKey, setSortKey] = useState<SortKey>('sent')
  const [asc, setAsc] = useState(false)
  const [selected, setSelected] = useState<string>(STAFF[0]?.id ?? '')

  const all = useMemo(() => new Map(STAFF.map((s) => [s.id, buildDays(s, 60)])), [])

  const rows = useMemo<Row[]>(() => STAFF.map((staff) => ({ staff, agg: aggregate(windowOf(all, staff.id, range, 0)) })), [range, all])
  const prevRows = useMemo<Row[]>(() => STAFF.map((staff) => ({ staff, agg: aggregate(windowOf(all, staff.id, range * 2, range)) })), [range, all])

  const sorted = useMemo(() => {
    const val = (r: Row): number | string => (sortKey === 'name' ? r.staff.name : (r.agg[sortKey] ?? -1))
    const out = [...rows].sort((a, b) => {
      const va = val(a)
      const vb = val(b)
      const c = typeof va === 'string' ? va.localeCompare(vb as string) : (va as number) - (vb as number)
      return asc ? c : -c
    })
    return out
  }, [rows, sortKey, asc])

  const sum = (rs: Row[], k: 'sent' | 'received' | 'cases'): number => rs.reduce((a, r) => a + r.agg[k], 0)
  const meanActive = (rs: Row[]): number => {
    const live = rs.filter((r) => r.agg.activeDays > 0)
    return live.length ? Math.round(live.reduce((a, r) => a + r.agg.avgActiveMin, 0) / live.length) : 0
  }
  const prevLabel = RANGES.find((r) => r.id === range)?.prev ?? ''

  const person = STAFF.find((s) => s.id === selected) ?? STAFF[0]
  const chartDays = person ? windowOf(all, person.id, range === 1 ? 7 : range, 0) : []

  const setSort = (k: SortKey) => {
    if (k === sortKey) setAsc(!asc)
    else {
      setSortKey(k)
      setAsc(k === 'name')
    }
  }

  const exportCsv = () => {
    const header = ['Staff', 'Role', 'Sent', 'Received', 'Cases opened (sample)', 'Avg active minutes per day', 'Typical first open', 'Typical last activity', 'Active days']
    const lines = [header, ...sorted.map((r) => [r.staff.name, r.staff.role, r.agg.sent, r.agg.received, r.agg.cases, r.agg.avgActiveMin, fmtClock(r.agg.avgFirst), fmtClock(r.agg.avgLast), r.agg.activeDays])]
    const csv = lines.map((l) => l.map(csvCell).join(',')).join('\r\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
    a.download = `pivot-mail-performance-${range === 1 ? 'today' : `${range}d`}-SAMPLE.csv`
    a.click()
    onToast('Exported sample CSV')
  }

  if (role !== 'admin') {
    return (
      <main className="perf">
        <div className="perf-forbidden">
          <img src={logoLockup} alt="Pivot Mail" className="logo-bar" />
          <h1>Admin only</h1>
          <p className="muted">This page is available to administrators. In the real app the server refuses this request for other roles.</p>
          <button type="button" className="btn primary" onClick={onBack}>
            Back to mail
          </button>
        </div>
      </main>
    )
  }

  const cols: { key: SortKey; label: string; num: boolean }[] = [
    { key: 'name', label: 'Staff', num: false },
    { key: 'sent', label: 'Sent', num: true },
    { key: 'received', label: 'Received', num: true },
    { key: 'cases', label: 'Cases opened', num: true },
    { key: 'avgActiveMin', label: 'Avg active / day', num: true },
    { key: 'avgFirst', label: 'First open', num: true },
    { key: 'avgLast', label: 'Last activity', num: true },
    { key: 'activeDays', label: 'Active days', num: true },
  ]

  return (
    <main className="perf">
      <header className="perf-head">
        <button type="button" className="icon-btn" style={{ display: 'inline-grid' }} onClick={onBack} aria-label="Back to mail" title="Back to mail">
          <Icon name="back" />
        </button>
        <img src={logoLockup} alt="Pivot Mail" className="logo-bar" />
        <span className="head-divider" aria-hidden="true" />
        <h1>Staff performance</h1>
        <span className="grow" />
        <div className="seg" role="group" aria-label="Date range">
          {RANGES.map((r) => (
            <button key={r.id} type="button" className={range === r.id ? 'on' : ''} aria-pressed={range === r.id} onClick={() => setRange(r.id)}>
              {r.label}
            </button>
          ))}
        </div>
        <button type="button" className="btn" onClick={exportCsv}>
          <Icon name="download" size={16} /> Export CSV
        </button>
      </header>

      <div className="perf-body">
        <p className="notice" role="note">
          <strong>Sample data.</strong> These figures are generated for the preview. Real numbers need Google sign-in, case records and activity tracking, none of which exist yet.
        </p>

        <section className="tiles" aria-label="Summary">
          <Tile label="Emails sent" value={sum(rows, 'sent').toLocaleString()} delta={delta(sum(rows, 'sent'), sum(prevRows, 'sent'), prevLabel)} />
          <Tile label="Emails received" value={sum(rows, 'received').toLocaleString()} delta={delta(sum(rows, 'received'), sum(prevRows, 'received'), prevLabel)} />
          <Tile label="Cases opened" value={sum(rows, 'cases').toLocaleString()} delta={delta(sum(rows, 'cases'), sum(prevRows, 'cases'), prevLabel)} note="Needs the Reference Generator (Phase 2)" />
          <Tile label="Avg active time per day" value={fmtDuration(meanActive(rows))} delta={delta(meanActive(rows), meanActive(prevRows), prevLabel)} />
        </section>

        <section className="card" aria-label="Staff table">
          <table className="ptable">
            <thead>
              <tr>
                {cols.map((c) => (
                  <th key={c.key} className={c.num ? 'num' : ''} aria-sort={sortKey === c.key ? (asc ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" onClick={() => setSort(c.key)}>
                      {c.label}
                      {sortKey === c.key && <span aria-hidden="true">{asc ? ' ▲' : ' ▼'}</span>}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map(({ staff, agg }) => (
                <tr key={staff.id} className={staff.id === selected ? 'sel' : ''} onClick={() => setSelected(staff.id)}>
                  <td data-label="Staff">
                    <button type="button" className="who" aria-pressed={staff.id === selected} onClick={() => setSelected(staff.id)}>
                      <span className="avatar">{initials(staff.name)}</span>
                      <span>
                        <strong>{staff.name}</strong>
                        <small>{staff.role}</small>
                      </span>
                    </button>
                  </td>
                  <td className="num" data-label="Sent">
                    {agg.sent.toLocaleString()}
                  </td>
                  <td className="num" data-label="Received">
                    {agg.received.toLocaleString()}
                  </td>
                  <td className="num" data-label="Cases">
                    {agg.cases.toLocaleString()}
                  </td>
                  <td className="num" data-label="Avg active / day">
                    {agg.activeDays ? fmtDuration(agg.avgActiveMin) : '–'}
                  </td>
                  <td className="num" data-label="First open">
                    {fmtClock(agg.avgFirst)}
                  </td>
                  <td className="num" data-label="Last activity">
                    {fmtClock(agg.avgLast)}
                  </td>
                  <td className="num" data-label="Active days">
                    {agg.activeDays}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="muted foot">First open and last activity are the average time of day across active days. Click a person for daily detail.</p>
        </section>

        {person && (
          <section className="card" aria-label={`Daily detail for ${person.name}`}>
            <h2 className="card-title">
              {person.name} <small>{range === 1 ? 'last 7 days' : `last ${range} days`}</small>
            </h2>
            <div className="charts">
              <ColumnChart
                title="Emails per day"
                days={chartDays}
                series={[
                  { key: 'sent', label: 'Sent', cssVar: '--series-1' },
                  { key: 'received', label: 'Received', cssVar: '--series-2' },
                ]}
                valueOf={(d, k) => (k === 'sent' ? d.sent : d.received)}
                format={(v) => v.toLocaleString()}
                axisFormat={(v) => String(Math.round(v))}
              />
              <ColumnChart
                title="Active time per day (hours)"
                days={chartDays}
                series={[{ key: 'active', label: 'Active time', cssVar: '--series-3' }]}
                valueOf={(d) => Math.round((d.activeMin / 60) * 10) / 10}
                format={(v) => `${v} h`}
                axisFormat={(v) => `${Math.round(v * 10) / 10}h`}
              />
            </div>
            <details className="table-view">
              <summary>Table view</summary>
              <div className="scroll-x">
                <table className="ptable plain">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num">Sent</th>
                      <th className="num">Received</th>
                      <th className="num">Cases</th>
                      <th className="num">Active</th>
                      <th className="num">First open</th>
                      <th className="num">Last activity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...chartDays].reverse().map((d) => (
                      <tr key={d.date}>
                        <td>{dayLabel(d.date, true)}</td>
                        <td className="num">{d.sent}</td>
                        <td className="num">{d.received}</td>
                        <td className="num">{d.cases}</td>
                        <td className="num">{fmtDuration(d.activeMin)}</td>
                        <td className="num">{fmtClock(d.firstOpen)}</td>
                        <td className="num">{fmtClock(d.lastActive)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>
        )}

        <details className="card defs">
          <summary>How these numbers are measured</summary>
          <ul>
            <li>
              <strong>Sent and received:</strong> counted from Gmail message metadata for each person's own mailbox. Spam and trash are excluded. Shared mailboxes are counted separately. Sending is attributed to the signed-in person.
            </li>
            <li>
              <strong>Active time:</strong> time the app is in the foreground with input in the last 60 seconds. ⚠️ The 60-second threshold is not confirmed.
            </li>
            <li>
              <strong>First open and last activity:</strong> earliest and latest activity each day, in Pivot's timezone. ⚠️ Timezone and weekend days are not confirmed.
            </li>
            <li>
              <strong>Cases opened:</strong> references generated by the person. Available once the Reference Generator is live.
            </li>
            <li>
              <strong>Privacy:</strong> only counts and timestamps are stored, never message content. ⚠️ Staff should be told in writing, and local employment and privacy rules apply. Verify with a legal specialist. Use these figures as a guide, not as a single score.
            </li>
          </ul>
        </details>
      </div>
    </main>
  )
}
