/** Responsive monitoring overview; failed attempts remain gaps rather than zero measurements. */
import type { ServerId } from '@deepseek-ai/dsh-client-ui-remote-ops/types'
import { useState, useRef, useEffect } from 'react'
import { Button, IconCodeOutlineRegular, IconLoadingOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-resources/client'
import type { Monitor, TemplateId } from '../types.ts'
import type { en } from './locales.ts'
import { HostSummary } from './host-summary.tsx'
import { OverviewCharts } from './charts.tsx'
import css from './page.module.css'
/** Narrow user actions; all live metric reads use the registered resource. */
export interface MonitorFace {
  enable(this: void, serverId: ServerId, templates: TemplateId[], target: string): Promise<void>
  disable(this: void, serverId: ServerId): Promise<void>
  manage(this: void): boolean
  plugins(this: void): boolean
  ask(this: void, prompt: string): void
}
type Props = PropsRuntime<'main'> & PropsLocale<'opsMonitor'> & InjectFace<MonitorFace>
/**
 * Reuse the shipped operations glyph for sidebar navigation.
 * @param props - sidebar geometry.
 * @returns product icon.
 */
export function MonitorIcon({ size }: PropsRuntime<'sidebar.panellist'>) { return <IconCodeOutlineRegular size={size} /> }
/**
 * Render enrollment, per-server charts and timestamped failure states.
 * @param props - resource hook, locale and user actions.
 * @returns operations dashboard.
 */
export function MonitorPage(props: Props) {
  const { t } = props
  const [retry, setRetry] = useState(0)
  const resource = props.useResource<'opsmonitor'>(`dsh-resource://opsmonitor/dashboard?retry=${retry}`)
  const view = resource.value
  const [editing, setEditing] = useState(false)
  const [managing, setManaging] = useState(false)
  const [serverId, setServerId] = useState<ServerId | ''>('')
  const [selected, setSelected] = useState<TemplateId[]>(['linux-health', 'linux-filesystems'])
  const [filter, setFilter] = useState('')
  const [chartView, setChartView] = useState('all')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(false)
  const [navigationError, setNavigationError] = useState<'missingSsh' | 'missingPlugins' | null>(null)
  const failureCode = resource.failure?.code
  const unavailable = failureCode === 'gateway/service-unavailable' || resource.status === 'none'
  const manage = () => { if (!props.manage()) setNavigationError('missingSsh') }
  const root = useRef<HTMLDivElement>(null)
  const [fullscreen, setFullscreen] = useState(false)
  useEffect(() => {
    const changed = () => { setFullscreen(document.fullscreenElement === root.current) }
    document.addEventListener('fullscreenchange', changed)
    return () => { document.removeEventListener('fullscreenchange', changed) }
  }, [])
  const selectHost = (id: string) => { setFilter(id); root.current?.scrollTo({ top: 0 }) }
  const chosenServer = view?.servers.find(server => server.id === serverId)
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError(false)
    try { await action() } catch (_operationFailure: unknown) { setError(true) }
    finally { setBusy(false) }
  }
  const stateOf = (monitor: Monitor) => {
    if (!monitor.enabled) return 'paused'
    const latest = monitor.samples.at(-1)
    if (!latest) return 'waiting'
    if (latest.status !== 'ok') return latest.status
    if (view && view.now - latest.at > view.intervalMs * 2) return 'stale'
    return 'live'
  }
  const monitors = view?.monitors ?? []
  const selectedMonitor = monitors.find(monitor => monitor.serverId === filter)
  const visibleMonitors = selectedMonitor ? [selectedMonitor] : monitors
  const host = view?.servers.find(server => server.id === selectedMonitor?.serverId)
  const lastAttempt = selectedMonitor?.samples.at(-1)
  const healthy = monitors.filter(monitor => stateOf(monitor) === 'live').length
  const chooseServer = (id: ServerId | '') => {
    setServerId(id)
    setSelected(view?.monitors.find(monitor => monitor.serverId === id)?.templates ?? ['linux-health', 'linux-filesystems'])
  }
  const availableViews = view?.templates.filter(template => visibleMonitors.some(monitor => monitor.templates.includes(template.id))) ?? []
  const resolvedView = chartView === 'all' || chartView === 'overview' || availableViews.some(template => template.id === chartView) ? chartView : 'all'
  const open = (id: ServerId | '' = '') => { chooseServer(id); setManaging(true); setEditing(true); setError(false) }
  return <div className={css.page} ref={root} data-ops-monitor>
    <header className={css.header}>
      <div><p className={css.eyebrow}>{t(selectedMonitor ? 'hostDetail' : 'subtitle')}</p><h1>{selectedMonitor?.name ?? t('title')}</h1>
        {selectedMonitor && <p className={css.hostAddress}>{host?.target === selectedMonitor.target ? host.host : t('targetChanged')}{host?.group ? ` · ${host.group}` : ''}</p>}</div>
      <div className={css.actions}>
        {selectedMonitor && <><Button onClick={() => { selectHost('') }}>{t('backOverview')}</Button><Button onClick={() => { props.ask(t('prompt') + selectedMonitor.serverId) }}>{t('ask')}</Button></>}
        <Button onClick={manage}>{t('manage')}</Button>
        <Button onClick={() => { setManaging(value => !value) }} aria-expanded={managing}>{t('configuration')}</Button>
        <Button onClick={() => void run(async () => {
          if (document.fullscreenElement) { await document.exitFullscreen(); setFullscreen(false) }
          else { await root.current?.requestFullscreen(); setFullscreen(true) }
        })}>{t(fullscreen ? 'leaveFullscreen' : 'fullscreen')}</Button>
      </div>
    </header>
    {(resource.status === 'failed' || resource.status === 'none' || view?.failure) && <div role="alert" className={css.notice}>
      {t(view?.failure ?? (unavailable ? 'backendMissing' : 'failed'))} {failureCode && <code>{failureCode}</code>} <Button onClick={() => { setRetry(value => value + 1) }}>{t('retry')}</Button>
    </div>}
    {navigationError && <p role="alert" className={css.notice}>{t(navigationError)}</p>}
    {(managing || resource.status === 'failed' || resource.status === 'none' || navigationError) && <div className={css.actions}>
      <Button onClick={() => { if (!props.plugins()) setNavigationError('missingPlugins') }}>{t('plugins')}</Button>
      <Button onClick={() => { open() }} disabled={resource.status !== 'live' || !view?.servers.length || busy}>{t('add')}</Button>
    </div>}
    {error && <p role="alert" className={css.notice}>{t('actionFailed')}</p>}
    {!view && resource.status === 'loading' && <div className={css.empty}><IconLoadingOutlineRegular size={24} /></div>}
    {view && <>
      {selectedMonitor ? <><div className={css.hostMeta}>
        <span className={css.status} data-state={stateOf(selectedMonitor)}>{t(stateOf(selectedMonitor))}</span>
        <span>{t('sampled')} · {lastAttempt ? new Date(lastAttempt.at).toLocaleString() : t('waiting')}</span><span>{t('interval')} · {view.intervalMs / 1000} {t('seconds')}</span>
        <span>{selectedMonitor.samples.length} {t('samples')}</span></div>
      <HostSummary monitor={selectedMonitor} now={view.now} intervalMs={view.intervalMs} t={t} /></>
        : <section className={css.summary}>
          {([['servers', monitors.length], ['healthy', healthy], ['attention', monitors.filter(m => m.enabled && stateOf(m) !== 'live').length], ['interval', `${view.intervalMs / 1000} ${t('seconds')}`]] as const)
            .map(([label, value]) => <div className={css.stat} key={label}><span>{t(label)}</span><strong>{value}</strong></div>)}
        </section>}
      {editing && <section className={css.editor} aria-label={t('add')}>
        <h2>{t('add')}</h2>
        <label>{t('server')}<select aria-label={t('server')} value={serverId} onChange={(event) =>{  chooseServer(event.target.value as ServerId) }} disabled={busy}>
          <option value="">—</option>{view.servers.map(server => <option key={server.id} value={server.id}>{server.name} · {server.host}</option>)}
        </select></label>
        <fieldset disabled={busy}><legend>{t('templates')}</legend>{view.templates.map(template => <div key={template.id}>
          <label><input type="checkbox" checked={selected.includes(template.id)} onChange={(event) =>{  setSelected(current => event.target.checked ? [...current, template.id] : current.filter(id => id !== template.id)) }} />{t(template.id)}</label>
          <p className={css.panelHint}>{template.fields.map(field => `${t(field.name)} (${field.unit})`).join(' · ')}</p>
          <details><summary>{template.id}</summary><pre>{template.script}</pre></details>
        </div>)}</fieldset>
        <p>{t('hint')}</p><div className={css.actions}>
          <Button disabled={busy || !chosenServer || !selected.length} onClick={() => void run(async () => { if (chosenServer) { await props.enable(chosenServer.id, selected, chosenServer.target); setEditing(false); setManaging(false) } })}>{t('save')}</Button>
          <Button disabled={busy} onClick={() => { setEditing(false) }}>{t('cancel')}</Button>
        </div>
      </section>}
      {!monitors.length && <section className={css.empty}><h2>{t('empty')}</h2><p>{t('emptyHint')}</p></section>}
      <div className={css.actions}>{!!monitors.length && <label className={css.filter}>{t('filter')}<select aria-label={t('filter')} value={selectedMonitor?.serverId ?? ''} onChange={(event) =>{  selectHost(event.target.value) }}>
        <option value="">{t('all')}</option>{monitors.map(m => <option key={m.serverId} value={m.serverId}>{m.name}</option>)}
      </select></label>}
      {!!monitors.length && <label className={css.filter}>{t('dashboardView')}<select aria-label={t('dashboardView')} value={resolvedView} onChange={(event) => { setChartView(event.target.value) }}>
        <option value="overview">{t('overview')}</option><option value="all">{t('allCharts')}</option>
        {availableViews.map(template =>
          <option key={template.id} value={template.id}>{t(template.id)}</option>)}
      </select></label>}
      </div>
      <div className={css.healthStrip}>{visibleMonitors.filter(m => stateOf(m) !== 'live').map(m =>
        <span key={m.serverId} className={css.status} data-state={stateOf(m)}>{m.name} · {t(stateOf(m))}{m.samples.at(-1)?.failures?.map(failure => ` · ${t(failure.templateId)}: ${t(failure.status)}`).join('')}</span>)}</div>
      {!!monitors.length && <OverviewCharts detail={!!selectedMonitor} onSelectHost={selectHost} templates={view.templates.filter(template => resolvedView === 'all' || (resolvedView === 'overview' ? ['linux-health', 'linux-filesystems'].includes(template.id) : resolvedView === template.id))} monitors={visibleMonitors}
        now={view.now} intervalMs={view.intervalMs} t={t} />}
      {managing && <section className={css.grid}>
        {visibleMonitors.map((monitor) => {
          const latest = monitor.samples.at(-1)
          return <article className={css.card} key={monitor.serverId}>
            <div className={css.cardHead}><h2>{monitor.name}</h2>
              <span className={css.status} data-state={stateOf(monitor)}>{t(stateOf(monitor))}</span></div>
            <p className={css.meta}>{t('sampled')} · {latest ? new Date(latest.at).toLocaleString() : t('waiting')} · {monitor.samples.length} {t('samples')}</p>
            <details><summary>{t('history')}</summary><div className={css.history}>{monitor.samples.slice(-10).reverse().map(sample => <p key={sample.at}>{new Date(sample.at).toLocaleTimeString()} · {sample.status === 'ok' || sample.status === 'partial' ? sample.metrics.map(m => `${t(m.name as keyof typeof en)} ${m.label === '-' ? '' : m.label} ${m.value}${m.unit}`).join(' · ') : t(sample.status)}</p>)}</div></details>
            <div className={css.actions}><Button onClick={() => { props.ask(t('prompt') + monitor.serverId) }}>{t('ask')}</Button><Button disabled={busy} onClick={() => { if (monitor.enabled) void run(() => props.disable(monitor.serverId)); else open(monitor.serverId) }}>{t(monitor.enabled ? 'pause' : 'resume')}</Button></div>
          </article>
        })}
      </section>}
    </>}
  </div>
}
