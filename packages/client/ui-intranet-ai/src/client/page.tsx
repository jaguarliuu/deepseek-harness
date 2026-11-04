/** State Grid capability workspace; all network and credential work remains on the Host. */
import { useEffect, useRef, useState } from 'react'
import { Button, Input, type SettingsFormScopeSnapshot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type { AccountStatus, AiArtifact, AiInput, AiResult, AiSettings, AiTask, Capability } from '../types.ts'
import { messageKey } from './locales.ts'
import css from './page.module.css'

/** UI operations injected by the Host-bound client plugin. */
export interface AiFace {
  hooks: { configuration: HostObservable<SettingsFormScopeSnapshot<AiSettings>> }
  save(value: AiSettings, revision: number | undefined): Promise<boolean>
  account(): Promise<AccountStatus>
  list(): Promise<AiTask[]>
  run(method: 'check' | 'login' | 'logout' | 'resume' | 'cancel', first?: string, second?: string): Promise<AiResult>
  submit(input: AiInput): Promise<AiResult>
  artifact(id: string, name: string): Promise<AiArtifact>
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'settings.intranetAi'> & InjectFace<AiFace>
/**
 * Render connection setup, account authorization and capability tasks.
 * @param props - localized injected operations.
 * @returns settings workspace.
 */
export function AiPage(props: Props) {
  const { t } = props
  const config = props.useConfiguration(value => value)
  const [baseUrl, setBaseUrl] = useState('')
  const [models, setModels] = useState('')
  const [voices, setVoices] = useState('')
  const [account, setAccount] = useState('')
  const [password, setPassword] = useState('')
  const [auth, setAuth] = useState<AccountStatus>({ connected: false, account: '' })
  const [kind, setKind] = useState<Capability>('image')
  const [text, setText] = useState('')
  const [model, setModel] = useState('')
  const [voice, setVoice] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [count, setCount] = useState(1)
  const [speed, setSpeed] = useState(1)
  const [instructions, setInstructions] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const accountKey = useRef('')
  const [tasks, setTasks] = useState<AiTask[]>([])
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [media, setMedia] = useState<Record<string, AiArtifact>>({})
  useEffect(() => {
    if (config.value) {
      setBaseUrl(config.value.baseUrl)
      setModels(config.value.imageModels.join('\n'))
      setVoices(config.value.voices.join('\n'))
    }
  }, [config.value])
  useEffect(() => {
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    const refresh = async (): Promise<void> => {
      try {
        const a = await props.account()
        const items = await props.list()
        if (live) {
          const key = `${config.value?.baseUrl ?? ''}/${a.account}`
          if (accountKey.current !== key) {
            accountKey.current = key
            setMedia({})
          }
          setAuth(a)
          setTasks(items)
        }
      } catch (_readFailure) {
        if (live) setNotice('connectionFailed')
      } finally {
        if (live)
          timer = setTimeout(() => {
            void refresh()
          }, 2000)
      }
    }
    setMedia({})
    setTasks([])
    setAuth({ connected: false, account: '' })
    accountKey.current = ''
    void refresh()
    return () => {
      live = false
      if (timer) clearTimeout(timer)
    }
  }, [props.account, props.list, config.value?.baseUrl])
  const perform = async (action: () => Promise<AiResult>): Promise<void> => {
    setBusy(true)
    setNotice('')
    try {
      const result = await action()
      setNotice(result.code)
    } catch (_operationFailure) {
      setNotice('localFailure')
    } finally {
      setBusy(false)
    }
  }
  const saveConnection = async (): Promise<AiResult> => {
    try {
      const url = new URL(baseUrl.trim())
      if (
        !['http:', 'https:'].includes(url.protocol) ||
        url.pathname !== '/' ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        return { ok: false, code: 'invalidUrl' }
      const imageModels = models
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean)
      const voiceIds = voices
        .split('\n')
        .map(x => x.trim())
        .filter(Boolean)
      if (!imageModels.length || !voiceIds.length) return { ok: false, code: 'invalidInput' }
      const ok = await props.save({ baseUrl: url.origin, imageModels, voices: voiceIds }, config.revision)
      setMedia({})
      return { ok, code: ok ? 'saved' : 'localFailure' }
    } catch (_invalidUrl) {
      return { ok: false, code: 'invalidUrl' }
    }
  }
  const submit = async (): Promise<AiResult> => {
    let fileBase64: string | undefined
    if (kind === 'ocr') {
      if (!file || file.size > 20971520) return { ok: false, code: 'invalidInput' }
      fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => {
          if (typeof reader.result !== 'string') reject(new Error('invalidInput'))
          else resolve(reader.result.slice(reader.result.indexOf(',') + 1))
        }
        reader.onerror = () => {
          reject(new Error('invalidInput'))
        }
        reader.readAsDataURL(file)
      })
    }
    return props.submit({
      capability: kind,
      text,
      ...(model ? { model } : {}),
      ...(voice ? { voice } : {}),
      size,
      n: count,
      speed,
      instructions,
      ...(file ? { filename: file.name } : {}),
      ...(fileBase64 ? { fileBase64 } : {}),
    })
  }
  return (
    <section className={css.page}>
      <header className={css.heading}>
        <p className={css.brand}>{t('brand')}</p>
        <h2>{t('title')}</h2>
        <p>{t('intro')}</p>
      </header>
      <div className={css.connections}>
        <details className={css.card} open={!auth.connected}>
          <summary>{t('connection')}</summary>
          <div className={css.form}>
            <label>
              {t('baseUrl')}
              <Input
                value={baseUrl}
                disabled={busy}
                onChange={(e) => {
                  setBaseUrl(e.target.value)
                }}
              />
            </label>
            <div className={css.columns}>
              <label>
                {t('models')}
                <textarea
                  value={models}
                  disabled={busy}
                  onChange={(e) => {
                    setModels(e.target.value)
                  }}
                />
              </label>
              <label>
                {t('voices')}
                <textarea
                  value={voices}
                  disabled={busy}
                  onChange={(e) => {
                    setVoices(e.target.value)
                  }}
                />
              </label>
            </div>
            <div className={css.actions}>
              <Button
                disabled={busy || !config.writable}
                variant="primary"
                onClick={() => {
                  void perform(saveConnection)
                }}
              >
                {t('save')}
              </Button>
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(() => props.run('check', baseUrl))
                }}
              >
                {t('check')}
              </Button>
            </div>
            <p className={css.hint}>{t('healthHint')}</p>
          </div>
        </details>
        <div className={css.card}>
          <h3>{t('account')}</h3>
          {auth.connected ? (
            <>
              <p className={css.connected}>
                {t('authorized')} · {auth.account}
              </p>
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(async () => {
                    const r = await props.run('logout')
                    setAuth({ connected: false, account: '' })
                    setMedia({})
                    setTasks([])
                    return r
                  })
                }}
              >
                {t('logout')}
              </Button>
            </>
          ) : (
            <div className={css.form}>
              <label>
                {t('account')}
                <Input
                  aria-label={t('account')}
                  value={account}
                  autoComplete="username"
                  disabled={busy}
                  onChange={(e) => {
                    setAccount(e.target.value)
                  }}
                />
              </label>
              <label>
                {t('password')}
                <Input
                  aria-label={t('password')}
                  type="password"
                  autoComplete="off"
                  value={password}
                  disabled={busy}
                  onChange={(e) => {
                    setPassword(e.target.value)
                  }}
                />
              </label>
              <Button
                variant="primary"
                disabled={busy || !config.value?.baseUrl}
                onClick={() => {
                  void perform(async () => {
                    try {
                      return await props.run('login', account, password)
                    } finally {
                      setPassword('')
                    }
                  })
                }}
              >
                {t('login')}
              </Button>
            </div>
          )}
          <p className={css.hint}>{t('accountHint')}</p>
        </div>
      </div>
      {notice && (
        <p className={css.notice} role="status">
          {t(messageKey(notice))}
        </p>
      )}
      <div className={css.card}>
        <div className={css.tabs}>
          {(['image', 'tts', 'ocr'] as const).map(value => (
            <Button
              key={value}
              variant={kind === value ? 'primary' : 'outline'}
              disabled={busy}
              onClick={() => {
                setKind(value)
              }}
            >
              {t(value)}
            </Button>
          ))}
        </div>
        <div className={css.form}>
          {kind !== 'ocr' ? (
            <label>
              {t('text')}
              <textarea
                maxLength={2000}
                value={text}
                disabled={busy}
                onChange={(e) => {
                  setText(e.target.value)
                }}
              />
            </label>
          ) : (
            <label>
              {t('file')}
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff"
                disabled={busy}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                }}
              />
            </label>
          )}
          <div className={css.columns}>
            {kind === 'image' && (
              <>
                <label>
                  {t('model')}
                  <select
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value)
                    }}
                  >
                    {(config.value?.imageModels ?? []).map(id => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('size')}
                  <Input
                    value={size}
                    onChange={(e) => {
                      setSize(e.target.value)
                    }}
                  />
                </label>
                <label>
                  {t('count')}
                  <Input
                    type="number"
                    min={1}
                    max={3}
                    value={count}
                    onChange={(e) => {
                      setCount(Number(e.target.value))
                    }}
                  />
                </label>
              </>
            )}
            {kind === 'tts' && (
              <>
                <label>
                  {t('voice')}
                  <select
                    value={voice}
                    onChange={(e) => {
                      setVoice(e.target.value)
                    }}
                  >
                    {(config.value?.voices ?? []).map(id => (
                      <option key={id} value={id}>
                        {id}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  {t('speed')}
                  <Input
                    type="number"
                    min={0.25}
                    max={4}
                    step={0.1}
                    value={speed}
                    onChange={(e) => {
                      setSpeed(Number(e.target.value))
                    }}
                  />
                </label>
                <label>
                  {t('instructions')}
                  <Input
                    value={instructions}
                    onChange={(e) => {
                      setInstructions(e.target.value)
                    }}
                  />
                </label>
              </>
            )}
          </div>
          <div>
            <Button
              variant="primary"
              disabled={busy || !auth.connected}
              onClick={() => {
                void perform(submit)
              }}
            >
              {t(busy ? 'busy' : 'submit')}
            </Button>
          </div>
        </div>
      </div>
      <h3>{t('tasks')}</h3>
      {!tasks.length && (
        <div className={css.empty}>
          <h3>{t('empty')}</h3>
          <p>{t('emptyHint')}</p>
        </div>
      )}
      {tasks.map(task => (
        <article className={css.card} key={task.id}>
          <div className={css.taskHeading}>
            <strong>{t(task.capability)}</strong>
            <span className={css.badge}>{t(messageKey(task.status))}</span>
          </div>
          {task.notice && <p className={css.notice}>{t(messageKey(task.notice))}</p>}
          {task.truncated && (
            <p className={css.notice}>
              {t('truncated')} {task.pages} / {task.totalPages}
            </p>
          )}
          {task.markdown && <pre className={css.markdown}>{task.markdown}</pre>}
          {task.previewTruncated && <p className={css.hint}>{t('previewHint')}</p>}
          <div className={css.actions}>
            {task.remoteId > 0 && !['failed', 'canceled'].includes(task.status) && (
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(() => props.run('resume', task.id))
                }}
              >
                {t('resume')}
              </Button>
            )}
            {['queued', 'running'].includes(task.status) && (
              <Button
                disabled={busy}
                onClick={() => {
                  void perform(() => props.run('cancel', task.id))
                }}
              >
                {t('cancel')}
              </Button>
            )}
          </div>
          {task.files.map((name) => {
            const asset = media[`${task.id}/${name}`]
            const url = asset ? `data:${asset.mime};base64,${asset.base64}` : ''
            return (
              <div className={css.artifact} key={name}>
                {asset ? (
                  <>
                    {asset.mime.startsWith('image/') && <img src={url} alt={name} />}
                    {asset.mime.startsWith('audio/') && <audio controls src={url} />}
                    <a download={name} href={url}>
                      {t('download')} · {name}
                    </a>
                  </>
                ) : (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      void perform(async () => {
                        const key = accountKey.current
                        const result = await props.artifact(task.id, name)
                        if (key !== accountKey.current) return { ok: false, code: 'accountChanged' }
                        setMedia(value => ({ ...value, [`${task.id}/${name}`]: result }))
                        return { ok: true, code: '' }
                      })
                    }}
                  >
                    {t('preview')} · {name}
                  </Button>
                )}
              </div>
            )
          })}
        </article>
      ))}
    </section>
  )
}
