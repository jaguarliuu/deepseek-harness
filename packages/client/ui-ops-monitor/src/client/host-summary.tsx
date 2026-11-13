/** Current host readings are separate from historical charts and omit stale, paused or missing observations. */
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { Monitor } from '../types.ts'
import css from './page.module.css'

type Props = PropsLocale<'opsMonitor'> & { monitor: Monitor; now: number; intervalMs: number }
/**
 * Show CPU and memory gauges alongside load and uptime for one selected host.
 * @param props - host enrollment, freshness window and localized copy.
 * @returns current readings; unavailable values remain empty.
 */
export function HostSummary({ monitor, now, intervalMs, t }: Props) {
  const sample = monitor.samples.at(-1)
  const current = monitor.enabled && sample && ['ok', 'partial'].includes(sample.status) && now - sample.at <= intervalMs * 2 ? sample : undefined
  return <section className={`${css.summary} ${css.hostSummary}`} aria-label={t('currentMetrics')}>
    {(['cpu_percent', 'memory_percent', 'load_1m', 'uptime_seconds'] as const).map((name) => {
      const raw = current?.metrics.find(metric => metric.name === name)?.value
      const value = typeof raw === 'number' ? raw : undefined
      const percentage = name === 'cpu_percent' || name === 'memory_percent'
      const text = value === undefined ? t('noValue') : name === 'uptime_seconds'
        ? `${Math.floor(value / 86400)} ${t('days')} ${Math.floor(value % 86400 / 3600)} ${t('hours')} ${Math.floor(value % 3600 / 60)} ${t('minutes')}`
        : `${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}${percentage ? ' %' : ''}`
      return <article className={`${css.stat} ${css.hostStat}`} key={name}>
        <div><span>{t(name)}</span><strong>{text}</strong></div>
        {percentage && <svg className={css.gauge} viewBox="0 0 100 100" role="img" aria-label={`${t(name)}: ${text}`}>
          <circle className={css.ringBase} cx="50" cy="50" r="38" />
          {value !== undefined && <circle className={css.ring} cx="50" cy="50" r="38" pathLength="100" strokeDasharray={`${value} 100`} />}
        </svg>}
      </article>
    })}
  </section>
}
