/** One-shot inference verification; a changed draft never retains a stale result. */
import { useState } from 'react'
import type { ReactNode } from 'react'
import type { LlmConnectionTestRequest } from '@deepseek-ai/dsh-api-remotes/client'
import type { ModelsOperations } from './operations.ts'
import type { en } from './locales.ts'
import styles from './ModelsSection.module.css'

/** Inputs and operation owner for the draft test. */
interface ConnectionTestProps {
  request: LlmConnectionTestRequest
  models: readonly string[]
  settingsNs: string
  operations: ModelsOperations
  t: (key: keyof typeof en) => string
  disabled: boolean
  onBusyChange: (busy: boolean) => void
}

/**
 * Render a model selector and draft connection test without persisting inputs.
 * @param props - current draft and injected host operations.
 * @returns the connection test controls and current result.
 */
export function ConnectionTest({ request, models, settingsNs, operations, t, disabled, onBusyChange }: ConnectionTestProps): ReactNode {
  const [selection, setSelection] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ draft: string; message?: string }>()
  const model = models.includes(selection) ? selection : request.model
  const draft = JSON.stringify({ ...request, model })
  const ready = /^https?:\/\//.test(request.baseURL) && model.trim().length > 0
  const run = async (): Promise<void> => {
    setBusy(true)
    onBusyChange(true)
    setResult(undefined)
    try {
      const message = await operations.testConnection(settingsNs, { ...request, model })
      setResult({ draft, ...message === undefined ? {} : { message } })
    } catch {
      setResult({ draft, message: t('connectionFailed') })
    } finally {
      setBusy(false)
      onBusyChange(false)
    }
  }
  const shownResult = result?.draft === draft ? result : undefined
  let feedback = ready ? '\u00a0' : t('connectionNeedsFields')
  if (shownResult !== undefined) {
    const message = shownResult.message
    feedback = message === undefined ? t('connectionSuccess')
      : message === 'HTTP 401' || message === 'HTTP 403' ? t('connectionAuthFailed')
        : message === 'HTTP 404' ? t('connectionModelFailed')
          : message.includes('timed out') ? t('connectionTimeout') : t('connectionFailed')
  }
  return <div className={styles['field']}>
    {models.length > 1 ? <label>
      {t('testModel')}
      <select className={`${styles['input']} ${styles['selectInput']}`} aria-label={t('testModel')} value={model} disabled={disabled || busy}
        onChange={(event) => { setSelection(event.target.value) }}>
        {models.map(id => <option key={id} value={id}>{id}</option>)}
      </select>
    </label> : null}
    <button type="button" className={styles['secondaryButton']} disabled={disabled || busy || !ready}
      onClick={() => { void run() }}>{t(busy ? 'testingConnection' : 'testConnection')}</button>
    <p aria-live="polite" className={styles[result?.draft === draft && result.message !== undefined ? 'error' : 'advancedHint']}>
      {feedback}
    </p>
  </div>
}
