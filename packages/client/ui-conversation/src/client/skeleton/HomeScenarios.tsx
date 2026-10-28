import { useState } from 'react'
import {
  IconListPenOutlineRegular, IconSearchOutlineRegular, IconGaugeOutlineRegular,
  IconShieldOutlineRegular, IconMicrophoneOutlineRegular, IconChecklistOutlineRegular,
  IconChevronRightOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HomeScenarios.module.css'

const scenarios = [
  { id: 'writing', Icon: IconListPenOutlineRegular },
  { id: 'reading', Icon: IconSearchOutlineRegular },
  { id: 'data', Icon: IconGaugeOutlineRegular },
  { id: 'inspection', Icon: IconShieldOutlineRegular },
  { id: 'meeting', Icon: IconMicrophoneOutlineRegular },
  { id: 'weekly', Icon: IconChecklistOutlineRegular },
] as const

/**
 * Show task templates that users can review before sending.
 * @param props - Localized copy, editing availability, and draft insertion callback.
 * @returns the home workflow shortcuts.
 */
export function HomeScenarios({ t, disabled, onSelect }: {
  t: ConversationContentProps['t']
  disabled: boolean
  onSelect: (prompt: string) => boolean
}) {
  const [selected, setSelected] = useState<string>()
  return (
    <section className={css.root} aria-label={t('home.scenarios')}>
      <div className={css.heading}>
        <h2>{t('home.scenarios')}</h2>
        <span>{disabled ? t('home.unavailable') : t('home.hint')}</span>
      </div>
      <div className={css.grid}>
        {scenarios.map(({ id, Icon }) => (
          <button key={id} type="button" className={css.card} disabled={disabled}
            onClick={() => { if (onSelect(t(`home.${id}.prompt`))) setSelected(id) }}>
            <span className={css.icon}><Icon size={20} /></span>
            <span className={css.copy}>
              <span className={css.title}>{t(`home.${id}.title`)}</span>
              <span className={css.description}>{t(`home.${id}.description`)}</span>
            </span>
            <IconChevronRightOutlineRegular className={css.arrow} size={14} />
          </button>
        ))}
      </div>
      <p className={css.status} role="status">{selected === undefined ? null : t('home.selected')}</p>
    </section>
  )
}
