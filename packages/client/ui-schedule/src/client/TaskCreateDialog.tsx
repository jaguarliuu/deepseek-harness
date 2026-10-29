/** Direct creation of a task without navigating away from the task manager. */
import { useState } from 'react'
import { Button, Modal } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { ScheduleCreateRequest } from '@deepseek-ai/dsh-schedule/client'
import css from './TaskCreateDialog.module.css'

/** Form inputs supplied by the task manager. */
interface Props extends PropsLocale<'schedule.manager'> {
  sessions: readonly { id: SessionId; title: string }[]
  onCreate: (sessionId: SessionId, request: ScheduleCreateRequest) => Promise<void>
  onClose: () => void
}

/** Render the task form, preserving entered values after a failed save. */
export function TaskCreateDialog({ sessions, onCreate, onClose, t }: Props) {
  const [selection, setSelection] = useState('')
  const [title, setTitle] = useState('')
  const [prompt, setPrompt] = useState('')
  const [kind, setKind] = useState('daily')
  const [date, setDate] = useState('')
  const [time, setTime] = useState('09:00')
  const [zone, setZone] = useState(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC')
  const [minutes, setMinutes] = useState('60')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const selected = sessions.find(session => session.id === selection) ?? sessions[0]
  return <Modal open title={t('empty.action')} closeLabel={t('detail.close')} onClose={() => { if (!pending) onClose() }}>
    <form className={css.form} onSubmit={(event) => {
      event.preventDefault()
      if (pending || selected === undefined) return
      setPending(true)
      setFailed(false)
      const executionTime = time.length === 5 ? `${time}:00` : time
      const request: ScheduleCreateRequest = { title, prompt,
        ...(kind === 'every' ? { every_seconds: Number(minutes) * 60 }
          : kind === 'daily' ? { daily: { time: executionTime, time_zone: zone } }
            : { at: { date, time: executionTime, time_zone: zone } }),
      }
      void onCreate(selected.id, request).then(onClose, () => { setFailed(true) }).finally(() => { setPending(false) })
    }}>
      <fieldset disabled={pending}>
        <label>{t('detail.name')}<input required maxLength={120} value={title} onChange={(event) => { setTitle(event.target.value) }} data-modal-autofocus /></label>
        <label>{t('detail.instruction')}<textarea required rows={4} value={prompt} onChange={(event) => { setPrompt(event.target.value) }} /></label>
        <label>{t('new.session')}<select required value={selected?.id ?? ''} onChange={(event) => { setSelection(event.target.value) }}>{sessions.map(session => <option key={session.id} value={session.id}>{session.title}</option>)}</select></label>
        <p>{t(selected === undefined ? 'new.empty' : 'new.sessionHint')}</p>
        <label>{t('detail.frequency')}<select value={kind} onChange={(event) => { setKind(event.target.value) }}>{(['once', 'daily', 'every'] as const).map(value => <option key={value} value={value}>{t(`new.${value}`)}</option>)}</select></label>
        {kind === 'every' ? <label>{t('new.minutes')}<input required type="number" min={1} step={1} value={minutes} onChange={(event) => { setMinutes(event.target.value) }} /></label> : <>
          {kind === 'once' && <label>{t('new.date')}<input required type="date" value={date} onChange={(event) => { setDate(event.target.value) }} /></label>}
          <label>{t('new.time')}<input required type="time" value={time} onChange={(event) => { setTime(event.target.value) }} /></label>
          <label>{t('new.zone')}<input required value={zone} onChange={(event) => { setZone(event.target.value) }} /></label>
        </>}
      </fieldset>
      {failed && <p role="alert">{t('new.failed')}</p>}
      <Button type="submit" variant="primary" disabled={pending || selected === undefined}>{t(pending ? 'new.saving' : 'new.save')}</Button>
    </form>
  </Modal>
}
