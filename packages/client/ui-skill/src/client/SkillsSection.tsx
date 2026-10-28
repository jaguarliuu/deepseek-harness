/** Session-scoped skill catalog in Settings. */
import { useState } from 'react'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SkillsSection.module.css'

type Props = PropsRuntime<'settings.section'> & PropsLocale<'skill'>

/** Browse the actual catalog of a selected work session. */
export function SkillsSection({ useSessions, useResource, t }: Props) {
  const sessions = useSessions(state => state)
  const [selection, setSelection] = useState('')
  const [query, setQuery] = useState('')
  const sessionId = sessions.ids.find(id => id === selection) ?? sessions.ids[0]
  const catalog = useResource<'skillcatalog'>(sessionId ? `dsh-resource://skillcatalog/${sessionId}` : '')
  const rows = (catalog.value?.skills ?? []).filter(skill => `${skill.name} ${skill.description}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()))
  return <section className={css.section}>
    <h2 className={css.title}>{t('page.title')}</h2>
    <p className={css.intro}>{t('page.intro')}</p>
    <label className={css.label}>{t('page.context')}
      <select value={sessionId ?? ''} onChange={(event) => { setSelection(event.target.value) }}>
        {sessions.ids.map(id => <option key={id} value={id}>{sessions.byId[id]?.title || sessions.byId[id]?.cwd || id}</option>)}
      </select>
    </label>
    <input className={css.search} aria-label={t('page.search')} placeholder={t('page.search')} value={query} onChange={(event) => { setQuery(event.target.value) }} />
    {catalog.status === 'failed' || catalog.value?.unavailable ? <p role="alert">{t('page.failed')}</p> : catalog.status === 'loading' ? <p role="status">{t('page.loading')}</p> : rows.length === 0 ? <p>{t(sessionId ? 'page.noResults' : 'page.empty')}</p> : null}
    <ul className={css.list}>{rows.map(skill => <li className={css.card} key={skill.name}>
      <div className={css.name}>/{skill.name}{!skill.modelInvocable && <span>{t('page.manual')}</span>}</div>
      <p>{skill.description}</p>
    </li>)}</ul>
  </section>
}
