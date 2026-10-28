/** Unified settings page for plugin and Python dependency sources. */
import { SettingsForm, SettingsValueField, type SettingsFieldState, type SettingsFormShell, type SettingsFormActions } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './SourceSettings.module.css'

/** One independently saved source configuration. */
export interface SourceCardState extends SettingsFormShell {
  field: SettingsFieldState
  effective: string
}

/** Renderer-bound stores and actions for the two owning Host entries. */
export interface SourceSettingsFace {
  hooks: { npmSource: HostObservable<SourceCardState>; pythonSource: HostObservable<SourceCardState> }
  npmActions: SettingsFormActions
  pythonActions: SettingsFormActions
}

/** Settings section props supplied by the slot renderer. */
export type SourceSettingsProps = PropsRuntime<'settings.section'> & PropsLocale<'settings.sources'> & InjectFace<SourceSettingsFace>

/** Render the source forms using the existing settings controls. */
export function SourceSettingsPage(props: SourceSettingsProps) {
  const { t } = props
  const npm = props.useNpmSource(value => value)
  const python = props.usePythonSource(value => value)
  const labels = { save: t('save'), saving: t('saving'), saveFailed: t('saveFailed'), unavailable: t('unavailable'), readOnly: t('readOnly') }
  return <section className={css.section}>
    <p className={css.brand}>{t('intro')}</p>
    <h2 className={css.title}>{t('title')}</h2>
    <p className={css.description}>{t('description')}</p>
    {([{ kind: 'npm', state: npm, actions: props.npmActions }, { kind: 'python', state: python, actions: props.pythonActions }] as const).map(({ kind, state, actions }) =>
      <section className={css.card} key={kind}>
        <h3>{t(kind)}</h3>
        <p className={css.description}>{t(kind === 'npm' ? 'npmHint' : 'pythonHint')}</p>
        <SettingsForm labels={labels} state={state} onSave={actions.save} onDiscard={actions.discard}>
          <SettingsValueField id={`intranet-${kind}`} label={t('address')} placeholder={kind === 'npm' ? 'https://npm.company.invalid/' : 'https://pypi.company.invalid/simple/'}
            overriddenLabel={t('overridden')} resetLabel={t('reset')} invalidLabel={t('invalid')}
            disabled={!state.writable || state.saving} {...state.field}
            onEdit={(text) => { actions.edit('registry', text) }} onReset={() => { actions.resetField('registry') }} />
          <p className={css.effective}>{t('effective')}：{state.effective || t('inherited')}</p>
        </SettingsForm>
      </section>)}
    <p className={css.description}>{t('note')}</p>
  </section>
}
