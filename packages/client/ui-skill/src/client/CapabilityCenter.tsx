import { SkillImport, type SkillImportInjected } from './SkillImport.tsx'
/** Unified application plugin and session skill discovery, hosted by the plugin manager. */
import { useId, useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { Button, Input, Modal, SegmentedTabs, IconPluginPinwheelOutlineRegular, IconChecklistOutlineRegular, writeClipboard } from '@deepseek-ai/dsh-client-ui-primitives'
import { isOfficeSkill, isPinnedCatalogTarget, OFFICE_SKILL_TITLES } from './capability-catalog.ts'
import css from './CapabilityCenter.module.css'

type Props = PropsRuntime<'plugins.tab'> & PropsLocale<'skill'> & SkillImportInjected
type Entry = {
  id: string
  name: string
  title: string
  description: string
  kind: 'plugin' | 'skill'
  office: boolean
  status: 'enabled' | 'disabled' | 'offered' | 'available'
  source: 'bundled' | 'installed' | 'session'
  version?: string
  target?: { spec: string; version: string }
}

/** Render details in a dismissable shared dialog; copying never submits a task. */
function CapabilityDetails({ entry, t, onClose, openPackage, install }: {
  entry: Entry
  t: Props['t']
  onClose: () => void
  openPackage: Props['openPackage']
  install: Props['install']
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const [confirming, setConfirming] = useState(false)
  const target = entry.target
  return <Modal open onClose={onClose} title={entry.title} closeLabel={t('center.close')}>
    <div className={css.details}>
      <p>{entry.description}</p>
      <dl className={css.facts}>
        <dt>{t('center.identity')}</dt><dd>{entry.name}</dd>
        <dt>{t('center.scope')}</dt><dd>{t(`center.${entry.source}`)}</dd>
        {entry.version && <><dt>{t('center.version')}</dt><dd>{entry.version}</dd></>}
      </dl>
      {entry.kind === 'skill' ? <>
        <label className={css.command}>{t('center.command')}<input readOnly value={`/${entry.name}`} onFocus={(event) => { event.target.select() }} /></label>
        <p>{t('center.useHint')}</p>
        {copyState !== 'idle' && <p role="status">{t(copyState === 'copied' ? 'center.copied' : 'center.copyFailed')}</p>}
        <Button variant="primary" onClick={() => { void writeClipboard(`/${entry.name} `).then((ok) => { setCopyState(ok ? 'copied' : 'failed') }) }}>{t('center.copy')}</Button>
      </> : <>
        {confirming && target ? <div className={css.confirm}><p>{t('center.installHint')}</p><code>{target.spec}</code>
          <Button variant="primary" onClick={() => { install({ ...target, title: entry.title }); onClose() }}>{t('center.confirm')}</Button>
        </div> : <div className={css.actions}>
          <Button variant="primary" onClick={() => { openPackage(entry.name); onClose() }}>{t('center.manage')}</Button>
          {target && <Button onClick={() => { setConfirming(true) }}>{t('center.install')}</Button>}
        </div>}
      </>}
    </div>
  </Modal>
}

/** Browse the two authoritative catalogs with one search and type/office filters. */
export function CapabilityCenter({ catalog = [], catalogStatus, useSessions, useResource, t, openPackage, install, onImportSkill }: Props) {
  const filterId = useId()
  const sessions = useSessions(state => state)
  const [selection, setSelection] = useState('')
  const [refreshKey, setRefreshKey] = useState(false)
  const [query, setQuery] = useState('')
  const [kind, setKind] = useState('all')
  const [officeOnly, setOfficeOnly] = useState(false)
  const [detailId, setDetailId] = useState<string | null>(null)
  const sessionId = sessions.ids.find(id => id === selection) ?? sessions.ids[0]
  const skills = useResource<'skillcatalog'>(sessionId ? `dsh-resource://skillcatalog/${sessionId}?refresh=${refreshKey ? 1 : 0}` : '')
  const skillEntries: Entry[] = (skills.value?.skills ?? []).map((skill) => {
    const titleKey = Object.entries(OFFICE_SKILL_TITLES).find(([name]) => name === skill.name)?.[1]
    return { id: `skill:${skill.name}`, name: skill.name, title: titleKey ? t(titleKey) : skill.name, description: skill.description,
      kind: 'skill', office: isOfficeSkill(skill.name), source: 'session', status: 'available' }
  })
  const pluginEntries: Entry[] = catalog.map(pkg => ({
    id: `plugin:${pkg.name}`, name: pkg.name, title: pkg.title, description: pkg.description || t('center.descriptionFallback'),
    kind: 'plugin', office: false, source: pkg.official ? 'bundled' : 'installed',
    status: pkg.enabled ? 'enabled' : pkg.installed || pkg.availability !== 'missing' ? 'disabled' : 'offered',
    ...(pkg.version ? { version: pkg.version } : {}),
    ...(!pkg.installed && pkg.availability === 'missing' && isPinnedCatalogTarget(pkg.name, pkg.installTarget) && pkg.installTarget ? { target: pkg.installTarget } : {}),
  }))
  const entries = [...skillEntries.filter(entry => entry.office), ...pluginEntries, ...skillEntries.filter(entry => !entry.office)]
  const search = query.trim().toLocaleLowerCase()
  const rows = entries.filter(entry => (kind === 'all' || entry.kind === kind) && (!officeOnly || entry.office)
    && `${entry.title} ${entry.name} ${entry.description}`.toLocaleLowerCase().includes(search))
  const detail = entries.find(entry => entry.id === detailId)
  return <section className={css.center}>
    <div className={css.hero}>
      <span className={css.eyebrow}>{t('center.brand')}</span>
      <h2>{t('center.title')}</h2><p>{t('center.intro')}</p>
      <span className={css.source}>{t('center.source')}</span>
    </div>
    <div className={css.toolbar}>
      <Input aria-label={t('center.search')} placeholder={t('center.search')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
      <label className={css.context}>{t('center.context')}
        <select value={sessionId ?? ''} onChange={(event) => { setSelection(event.target.value) }}>
          {sessions.ids.map(id => <option key={id} value={id}>{sessions.byId[id]?.title || sessions.byId[id]?.cwd || id}</option>)}
        </select>
      </label>
    </div>
    <SkillImport sessionId={sessionId} onImportSkill={onImportSkill} onImported={() => { setRefreshKey(value => !value) }} t={t} />
    <div className={css.filters}>
      <SegmentedTabs label={t('center.browse')} value={kind} onChange={setKind} items={[
        { value: 'all', label: t('center.all'), id: `${filterId}-all`, panelId: `${filterId}-panel` },
        { value: 'plugin', label: t('center.plugins'), id: `${filterId}-plugin`, panelId: `${filterId}-panel` },
        { value: 'skill', label: t('center.skills'), id: `${filterId}-skill`, panelId: `${filterId}-panel` },
      ]} />
      <button className={css.facet} aria-pressed={officeOnly} onClick={() => { setOfficeOnly(value => !value) }}>{t('center.office')}</button>
      <span className={css.count}>{t('center.summary', { plugins: String(pluginEntries.length), skills: String(skillEntries.length) })}</span>
      <Button size="sm" disabled={!sessionId || skills.status === 'loading'}
        onClick={() => { setRefreshKey(value => !value) }}>{t('center.refresh')}</Button>
    </div>
    {(catalogStatus === 'error' || catalogStatus === 'unavailable') && <p role="alert">{t('center.pluginError')}</p>}
    {(skills.status === 'failed' || skills.value?.unavailable) && <p role="alert">{t('center.skillError')}</p>}
    {!sessionId && <p role="status">{t('center.sessionEmpty')}</p>}
    {(skills.status === 'loading' || catalogStatus === 'loading') && <div className={css.skeleton} aria-label={t('page.loading')} role="status"><span /><span /><span /></div>}
    {rows.length === 0 && skills.status !== 'loading' && catalogStatus !== 'loading' && <p className={css.empty}>{t('center.empty')}</p>}
    <div role="tabpanel" id={`${filterId}-panel`} aria-labelledby={`${filterId}-${kind}`}><ul className={css.grid}>{rows.map(entry => <li key={entry.id}>
      <button className={css.card} onClick={() => { setDetailId(entry.id) }}
        aria-label={`${entry.title} · ${t('center.details')}`}>
        <div className={css.cardHead}><span className={css.icon}>
          {entry.kind === 'plugin' ? <IconPluginPinwheelOutlineRegular size={24} /> : <IconChecklistOutlineRegular size={24} />}</span>
        <span className={css.type}>{t(entry.kind === 'plugin' ? 'center.plugins' : 'center.skills')}</span></div>
        <h3>{entry.title}</h3><p>{entry.description}</p>
        <div className={css.cardFoot}>
          <span>{t(`center.${entry.status}`)}</span><span>{t('center.details')} ↗</span></div>
      </button>
    </li>)}</ul></div>
    {detail && <CapabilityDetails key={detail.id} entry={detail} t={t} onClose={() => { setDetailId(null) }}
      openPackage={openPackage} install={install} />}
  </section>
}
