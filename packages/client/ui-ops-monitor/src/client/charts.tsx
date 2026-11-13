/** Fleet charts share a time axis; failed samples never become numeric observations. */
import type { ServerId } from '@deepseek-ai/dsh-client-ui-remote-ops/types'
import type { CSSProperties } from 'react'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Monitor, PanelDefinition, Template } from '../types.ts'
import css from './page.module.css'

type Translate = PropsLocale<'opsMonitor'>['t']
type ChartProps = {
  detail: boolean
  onSelectHost: (id: ServerId) => void
  templates: Template[]
  monitors: Monitor[]
  now: number
  intervalMs: number
  t: Translate
}
type Point = { x: number; y: number; at: number; value: number }
const metricNames = ['cpu_percent', 'memory_percent', 'disk_percent'] as const

/**
 * Render template charts and optional fleet summaries without generating missing measurements.
 * @param props - selected hosts, display mode, drill-down action, freshness window and localized labels.
 * @returns fleet status, trends, capacity ranking and resource heatmap.
 */
export function OverviewCharts({ monitors, templates, now, intervalMs, t, detail, onSelectHost }: ChartProps) {
  const current = (monitor: Monitor) => {
    const sample = monitor.samples.at(-1)
    return monitor.enabled && (sample?.status === 'ok' || sample?.status === 'partial') && now - sample.at <= intervalMs * 2 ? sample : undefined
  }
  const live = monitors.filter(m => current(m)?.status === 'ok').length
  const paused = monitors.filter(m => !m.enabled).length
  const counts = [{ key: 'healthy', count: live }, { key: 'other', count: monitors.length - live - paused }, { key: 'paused', count: paused }] as const
  const panels = templates.filter(template => monitors.some(m => m.templates.includes(template.id))).flatMap(template => template.panels)
  let offset = 0
  return <section className={`${css.chartGrid} ${panels.length === 2 ? css.focusedGrid : ''} ${detail ? css.hostCharts : ''}`} aria-label={t('title')}>
    {!detail && <article className={css.panel}>
      <h2>{t('fleet')}</h2>
      <div className={css.donutWrap}>
        <svg viewBox="0 0 200 200" className={css.donut} role="img" aria-label={counts.map(item => `${t(item.key)} ${item.count}`).join(' · ')}>
          <circle className={css.ringBase} cx="100" cy="100" r="76" />
          {counts.map((item) => {
            const start = offset; offset += item.count / monitors.length * 100
            return <circle key={item.key} data-tone={item.key} className={css.ring} cx="100" cy="100" r="76" pathLength="100" strokeDasharray={`${item.count / monitors.length * 100} 100`} strokeDashoffset={-start}><title>{t(item.key)}: {item.count}</title></circle>
          })}
        </svg>
        <div className={css.donutLabel}><strong>{monitors.length}</strong><span>{t('total')}</span></div>
      </div>
      <div className={css.statusLegend}>{counts.map(item =>
        <span key={item.key} data-tone={item.key}><i />{t(item.key)}<strong>{item.count}</strong></span>)}</div>
    </article>}
    {panels.map(panel => panel.chart === 'trend'
      ? <Trend key={panel.metric} monitors={monitors} panel={panel} t={t} />
      : <Ranking key={panel.metric} monitors={monitors} panel={panel} now={now} intervalMs={intervalMs} t={t} />)}
    {!detail && <article className={css.panel}>
      <h2>{t('resourceMap')}</h2><p className={css.panelHint}>{t('currentOnly')}</p>
      <div className={css.matrix} role="table" aria-label={t('resourceMap')}>
        <div className={css.matrixRow} role="row"><span role="columnheader">{t('total')}</span>{metricNames.map(name => <span role="columnheader" key={name}>{t(name)}</span>)}</div>
        {monitors.map(monitor => <div className={css.matrixRow} role="row" key={monitor.serverId}>
          <span role="rowheader"><button type="button" className={css.hostLink} aria-label={`${t('openHost')} ${monitor.name}`} onClick={() => { onSelectHost(monitor.serverId) }}>{monitor.name}</button></span>
          {metricNames.map((name) => {
            const values = (current(monitor)?.metrics ?? []).filter(m => m.name === name).flatMap(m => typeof m.value === 'number' ? [m.value] : [])
            const value = values.length ? Math.max(...values) : undefined
            return <span role="cell" key={name} className={css.heat} data-level={value === undefined ? 'missing' : value >= 85 ? 'high' : value >= 60 ? 'medium' : 'low'} style={{ '--intensity': value === undefined ? 0 : .12 + value / 150 } as CSSProperties}><span>{value === undefined ? '—' : `${format(value)} %`}</span></span>
          })}
        </div>)}
      </div>
    </article>}
  </section>
}

function panelTitle(panel: PanelDefinition, t: Translate) {
  switch (panel.metric) {
    case 'cpu_percent': return t('cpuTrend')
    case 'memory_percent': return t('memoryTrend')
    case 'load_1m': return t('loadTrend')
    case 'disk_percent': return t('diskRanking')
    default: return t(panel.metric)
  }
}
function Ranking({ monitors, panel, now, intervalMs, t }: Omit<ChartProps, 'templates' | 'detail' | 'onSelectHost'> & { panel: PanelDefinition }) {
  const rows = monitors.flatMap((monitor) => {
    const sample = monitor.samples.at(-1)
    if (!monitor.enabled || !sample || !['ok', 'partial'].includes(sample.status) || now - sample.at > intervalMs * 2) return []
    return sample.metrics.flatMap((metric) => {
      if (metric.name !== panel.metric || typeof metric.value !== 'number') return []
      const total = sample.metrics.find(item => item.name === panel.totalMetric && item.label === metric.label)?.value
      const process = sample.metrics.find(item => item.name === panel.nameMetric && item.label === metric.label)?.value
      return [{ key: `${monitor.serverId}:${metric.label}`, name: [monitors.length > 1 || metric.label === '-' ? monitor.name : '', metric.label === '-' ? '' : metric.label, process].filter(Boolean).join(' · '),
        value: metric.value, total: typeof total === 'number' ? total : undefined }]
    })
  }).sort((a, b) => b.value - a.value)
  const maximum = panel.maximum ?? Math.max(1, ...rows.map(row => row.value))
  return <article className={css.panel}>
    <h2>{panelTitle(panel, t)}</h2><p className={css.panelHint}>{t('currentOnly')}</p>
    <div className={css.ranking}>
      {!rows.length && <p className={css.noData}>{t('noValue')}</p>}
      {rows.map((row) => {
        const max = row.total ?? maximum
        const percent = max > 0 ? row.value / max * 100 : 0
        return <div className={css.barRow} key={row.key}>
          <div><span>{row.name}</span><strong>{formatUnit(row.value, panel.unit)}{row.total === undefined ? '' : ` / ${formatUnit(row.total, panel.unit)}`}</strong></div>
          <div className={css.barTrack} role="meter" aria-label={row.name} aria-valuenow={row.value} aria-valuemin={0} aria-valuemax={Math.max(max, row.value)}><span data-high={panel.maximum === 100 && percent >= 85} style={{ width: `${Math.min(100, percent)}%` }} /></div>
        </div>
      })}
    </div>
  </article>
}
function Trend({ monitors, panel, t }: { monitors: Monitor[]; panel: PanelDefinition; t: Translate }) {
  const series = monitors.flatMap((monitor) => {
    const labels = [...new Set(monitor.samples.flatMap(s => s.metrics.filter(m => m.name === panel.metric).map(m => m.label)))]
    return labels.map(label => ({ monitor, label, key: `${monitor.serverId}:${label}`, name: monitors.length === 1 ? label === '-' ? t(panel.metric) : label : `${monitor.name}${label === '-' ? '' : ` · ${label}`}` }))
  })
  const times = monitors.flatMap(m => m.samples.map(s => s.at))
  const first = times.length ? Math.min(...times) : 0, last = times.length ? Math.max(...times) : first
  const values = monitors.flatMap(m => m.samples.flatMap(s => ['ok', 'partial'].includes(s.status) ? s.metrics.flatMap(value => value.name === panel.metric && typeof value.value === 'number' ? [value.value] : []) : []))
  const max = panel.maximum ?? Math.max(1, Math.ceil(Math.max(0, ...values)))
  const title = panelTitle(panel, t)
  return <article className={css.panel}>
    <h2>{title}</h2><p className={css.panelHint}>{t(panel.unit === 'B/s' ? 'rateHint' : 'historical')}</p>
    <div className={css.plot}>
      <div className={css.axis}><span>{formatUnit(max, panel.unit)}</span><span>{formatUnit(max / 2, panel.unit)}</span><span>0</span></div>
      <svg className={css.chart} viewBox="0 0 600 200" preserveAspectRatio="none" role="img" aria-label={title}>
        {[10, 100, 190].map(y => <line key={y} x1="0" x2="600" y1={y} y2={y} />)}
        {series.map((item, index) => <g key={item.key} data-series={index % 5}>
          {segments(item.monitor, panel.metric, item.label, first, last, max).map((points) => {
            const start = points[0], end = points.at(-1)
            if (!start || !end) return null
            return <g key={start.at}>
              <polygon className={css.area} points={`${start.x},190 ${points.map(p => `${p.x},${p.y}`).join(' ')} ${end.x},190 ${start.x},190`} />
              <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} strokeDasharray={index >= 5 ? `${2 + Math.floor(index / 5) * 2} 4` : undefined} />
              {points.map(point => <circle key={point.at} cx={point.x} cy={point.y} r="3"><title>{item.name} · {new Date(point.at).toLocaleTimeString()} · {formatUnit(point.value, panel.unit)}</title></circle>)}
            </g>
          })}
        </g>)}
      </svg>
      {!values.length && <div className={css.chartEmpty}>{t('noValue')}</div>}
    </div>
    <div className={css.timeAxis}><span>{times.length ? time(first) : '—'}</span><span>{times.length ? time(last) : '—'}</span></div>
    <div className={css.legend}>{series.map((item, index) => <span key={item.key} data-series={index % 5}><i />{item.name}</span>)}</div>
  </article>
}
function formatUnit(value: number, unit: string) {
  if (unit === 'B' || unit === 'B/s') {
    const power = Math.min(3, Math.floor(Math.log2(Math.max(1, value)) / 10))
    return `${format(value / 1024 ** power)} ${['', 'Ki', 'Mi', 'Gi'][power]}${unit}`
  }
  return `${format(value)}${unit === 'load' ? '' : ` ${unit}`}`
}
function format(value: number) { return value.toLocaleString(undefined, { maximumFractionDigits: 1 }) }
function time(at: number) { return new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }
function segments(monitor: Monitor, name: string, label: string, first: number, last: number, max: number): Point[][] {
  const groups: Point[][] = []
  let current: Point[] = []
  for (const sample of monitor.samples) {
    const metric = ['ok', 'partial'].includes(sample.status) ? sample.metrics.find(item => item.name === name && item.label === label) : undefined
    if (!metric || typeof metric.value !== 'number') { if (current.length) groups.push(current); current = []; continue }
    current.push({
      x: last === first ? 300 : 4 + (sample.at - first) / (last - first) * 592,
      y: 190 - metric.value / max * 180, at: sample.at, value: metric.value,
    })
  }
  if (current.length) groups.push(current)
  return groups
}
