/** Compact State Grid operations workspace with a local-only connection form. */
import { useEffect, useState, useMemo, useRef } from 'react'
import {
  Button,
  Input,
  Modal,
  Toast,
  IconCodeOutlineRegular,
  IconPlusOutlineRegular,
  IconLoadingOutlineRegular,
} from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type { OpsResult, ServerId, ServerInput, ServerView, TerminalId, TerminalView } from '../types.ts'
import { createTerminalStore } from './store.ts'
import { SshTerminal } from './terminal.tsx'
import { en } from './locales.ts'
import css from './page.module.css'
/** Local Host RPC and conversation navigation callbacks. */
export interface OpsFace {
  list(this: void): Promise<ServerView[]>
  probe(this: void, host: string, port: number): Promise<OpsResult>
  save(this: void, input: ServerInput): Promise<OpsResult>
  test(this: void, id: ServerId): Promise<OpsResult>
  remove(this: void, id: ServerId): Promise<OpsResult>
  connect(this: void, id: ServerId): Promise<TerminalId>
  read(this: void, id: TerminalId, cursor: number): Promise<TerminalView>
  write(this: void, id: TerminalId, data: string, cols: number, rows: number): Promise<void>
  disconnect(this: void, id: TerminalId): Promise<void>
  ask(this: void, prompt: string): void
}
type Store = ReturnType<typeof createTerminalStore>
type Props = PropsRuntime<'main'> & PropsLocale<'remoteOps'> & PropsStore<Store> & InjectFace<OpsFace>
/**
 * Render the sidebar entry using an existing code-console glyph.
 * @param props - sidebar icon sizing.
 * @returns existing product glyph.
 */
export function OpsIcon({ size }: PropsRuntime<'sidebar.panellist'>) {
  return <IconCodeOutlineRegular size={size} />
}
/**
 * Keep operation feedback alive when navigation closes the workspace.
 * @param props - shared notice store and locale.
 * @returns global toast.
 */
export function OpsToast(props: PropsRuntime<'shell.overlay'> & PropsLocale<'remoteOps'> & PropsStore<Store>) {
  const notice = props.useStore(s => s.notice),
    sequence = props.useStore(s => s.sequence)
  return notice ? (
    <Toast
      key={sequence}
      text={notice}
      onDone={() => {
        props.actions.clearNotice()
      }}
    />
  ) : null
}
const emptyForm = (): ServerInput => ({
  name: '',
  group: '',
  host: '',
  port: 22,
  username: '',
  auth: 'password',
  secret: '',
  passphrase: '',
  fingerprint: '',
})
/**
 * Render server inventory, retained terminal tabs and explicit AI handoff.
 * @param props - localized RPC, navigation and tab store.
 * @returns remote operations workspace.
 */
export function OpsPage(props: Props) {
  const { t } = props
  const face = useMemo(
    () => ({
      list: props.list,
      probe: props.probe,
      save: props.save,
      test: props.test,
      remove: props.remove,
      connect: props.connect,
      read: props.read,
      write: props.write,
      disconnect: props.disconnect,
      ask: props.ask,
    }),
    [
      props.list,
      props.probe,
      props.save,
      props.test,
      props.remove,
      props.connect,
      props.read,
      props.write,
      props.disconnect,
      props.ask,
    ],
  )
  const tabs = props.useStore(s => s.tabs)
  const [loading, setLoading] = useState(true)
  const [servers, setServers] = useState<ServerView[]>([])
  const [selected, select] = useState<ServerId | null>(null)
  const [activeId, activate] = useState<TerminalId | null>(null)
  const [query, setQuery] = useState('')
  const [form, setForm] = useState<ServerInput | null>(null)
  const [keyFilename, setKeyFilename] = useState('')
  const keyInput = useRef<HTMLInputElement>(null)
  const [keyFileFailed, setKeyFileFailed] = useState(false)
  const [readingKey, setReadingKey] = useState(false)
  const keyRequest = useRef(0)
  const [trusted, setTrusted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState<Record<string, string>>({})
  const [selection, setSelection] = useState<Record<string, string>>({})
  const [deleting, setDeleting] = useState(false)
  const server = servers.find(v => v.id === selected) ?? servers[0]
  const active = tabs.find(v => v.id === activeId) ?? tabs[0]
  const message = (code: string) => t(code in en ? (code as keyof typeof en) : 'localFailure')
  const refresh = async () => {
    setServers(await props.list())
    setError('')
  }
  useEffect(() => {
    let live = true
    props
      .list()
      .then((items) => {
        if (live) {
          setServers(items)
          setLoading(false)
        }
      })
      .catch((_error: unknown) => {
        if (live) {
          setError(t('localFailure'))
          setLoading(false)
        }
      })
    return () => {
      live = false
    }
  }, [props.list, t])
  const run = async (work: () => Promise<void>) => {
    if (busy) return
    setBusy(true)
    setError('')
    try {
      await work()
    } catch (_operationError: unknown) {
      setError(t('connectionFailed'))
    } finally {
      setBusy(false)
    }
  }
  const result = (value: OpsResult) => {
    if (!value.ok) {
      setError(message(value.code))
      return false
    }
    props.actions.notify(message(value.code))
    return true
  }
  const ask = (analyze: boolean) => {
    const target = analyze ? active?.server : server
    if (!target) return
    const output = active ? selection[active.id] : ''
    if (analyze && !output) {
      props.actions.notify(t('noSelection'))
      return
    }
    props.ask(
      `${t(analyze ? 'analyzePrompt' : 'inspectPrompt')} ${target.name} (${target.id}, ${target.host}:${target.port})${analyze ? `\n<terminal-output>\n${output}\n</terminal-output>\n${t('endOutput')}` : ''}`,
    )
  }
  const closeForm = () => {
    keyRequest.current++
    setReadingKey(false)
    setKeyFilename('')
    setKeyFileFailed(false)
    setForm(null)
  }
  const openForm = (value?: ServerView) => {
    keyRequest.current++
    setReadingKey(false)
    setKeyFilename('')
    setKeyFileFailed(false)
    setForm(value ? { ...value, secret: '', passphrase: '' } : emptyForm())
    setTrusted(false)
    setError('')
  }
  const patch = (field: keyof ServerInput, value: string | number) => {
    if (!form) return
    if (field === 'auth') {
      keyRequest.current++
      setReadingKey(false)
      setKeyFilename('')
      setKeyFileFailed(false)
      setForm({ ...form, auth: value as ServerInput['auth'], secret: '', passphrase: '' })
      return
    }
    setForm({ ...form, [field]: value })
    if (field === 'host' || field === 'port') {
      setForm({ ...form, [field]: value, fingerprint: '' })
      setTrusted(false)
    }
  }
  const selectKeyFile = async (file: File) => {
    const request = ++keyRequest.current
    setError('')
    setKeyFilename('')
    setKeyFileFailed(false)
    setForm(previous => (previous ? { ...previous, secret: '' } : previous))
    if (!file.size || file.size > 65536) {
      setKeyFileFailed(true)
      setError(t('keyFileSize'))
      return
    }
    setReadingKey(true)
    try {
      const contents = await file.text()
      if (request !== keyRequest.current) return
      if (!contents.trim()) {
        setKeyFileFailed(true)
        setError(t('invalidKeyFile'))
        return
      }
      setForm(previous => (previous?.auth === 'key' ? { ...previous, secret: contents } : previous))
      setKeyFilename(file.name)
    } catch (_fileReadError: unknown) {
      if (request === keyRequest.current) {
        setKeyFileFailed(true)
        setError(t('keyFileReadFailed'))
      }
    } finally {
      if (request === keyRequest.current) setReadingKey(false)
    }
  }
  if (loading)
    return (
      <section className={css.loading} role="status" aria-label={t('busy')}>
        <IconLoadingOutlineRegular size={24} />
      </section>
    )
  const filtered = servers.filter(s => `${s.name} ${s.group} ${s.host}`.toLowerCase().includes(query.toLowerCase()))
  return (
    <section className={css.page}>
      <header className={css.heading}>
        <div>
          <span className={css.eyebrow}>{t('brand')}</span>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <Button
          variant="primary"
          icon={<IconPlusOutlineRegular size={16} />}
          onClick={() => {
            openForm()
          }}
        >
          {t('add')}
        </Button>
      </header>
      {error && !form && (
        <div className={css.notice} role="alert">
          {error}
          <Button
            size="sm"
            onClick={() => {
              void run(refresh)
            }}
          >
            {t('retry')}
          </Button>
        </div>
      )}
      <div className={css.workspace}>
        <aside className={css.inventory}>
          <div className={css.inventoryHead}>
            <span>{t('all')}</span>
            <span className={css.count}>{servers.length}</span>
          </div>
          <Input
            aria-label={t('search')}
            placeholder={t('search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
            }}
          />
          <div className={css.serverList}>
            {filtered.map(s => (
              <button
                key={s.id}
                className={`${css.server} ${server?.id === s.id ? css.selected : ''}`}
                onClick={() => {
                  select(s.id)
                }}
              >
                <span className={css.serverTop}>
                  <IconCodeOutlineRegular size={18} />
                  <strong>{s.name}</strong>
                </span>
                <span className={css.address}>
                  {s.username}@{s.host}
                </span>
                <span className={css.tag}>{s.group || t('all')}</span>
              </button>
            ))}
          </div>
          <div className={css.localNote}>
            <strong>{t('local')}</strong>
            <p>{t('localHint')}</p>
          </div>
        </aside>
        <div className={css.console}>
          <div className={css.consoleHeader}>
            <div>
              <strong>{server?.name ?? t('terminalTitle')}</strong>
              <span>{server ? `${server.host}:${server.port}` : t('isolated')}</span>
            </div>
            <div className={css.actions}>
              {server && (
                <>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      openForm(server)
                    }}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        result(await props.test(server.id))
                      })
                    }}
                  >
                    {t('test')}
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy}
                    onClick={() => {
                      void run(async () => {
                        const id = await props.connect(server.id)
                        props.actions.add({ id, server })
                        activate(id)
                      })
                    }}
                  >
                    {busy ? t('busy') : t('connect')}
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy || tabs.some(v => v.server.id === server.id)}
                    onClick={() => {
                      setDeleting(true)
                    }}
                  >
                    {t('remove')}
                  </Button>
                </>
              )}
            </div>
          </div>
          {tabs.length > 0 ? (
            <>
              <div className={css.tabs} role="tablist">
                {tabs.map(tab => (
                  <button
                    key={tab.id}
                    role="tab"
                    aria-selected={active?.id === tab.id}
                    className={active?.id === tab.id ? css.activeTab : ''}
                    onClick={() => {
                      activate(tab.id)
                    }}
                  >
                    {tab.server.name}
                    <span className={css.tabStatus}>{message(status[tab.id] ?? 'connected')}</span>
                  </button>
                ))}
              </div>
              <div className={css.terminalArea}>
                {tabs.map(tab => (
                  <SshTerminal
                    key={tab.id}
                    id={tab.id}
                    face={face}
                    visible={active?.id === tab.id}
                    label={`${t('terminalTitle')} ${tab.server.name}`}
                    onSelection={(value) => {
                      setSelection(prev => ({ ...prev, [tab.id]: value }))
                    }}
                    onStatus={(value) => {
                      setStatus(prev => ({ ...prev, [tab.id]: value }))
                    }}
                  />
                ))}
              </div>
              <div className={css.terminalFooter}>
                <span>{t('isolated')}</span>
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    if (active)
                      void run(async () => {
                        await props.disconnect(active.id)
                        props.actions.remove(active.id)
                      })
                  }}
                >
                  {t('disconnect')}
                </Button>
              </div>
            </>
          ) : (
            <div className={css.empty}>
              <div className={css.consoleGlyph}>
                <IconCodeOutlineRegular size={40} />
              </div>
              <h2>{t(servers.length ? 'terminalHint' : 'noServers')}</h2>
              <p>{t('emptyHint')}</p>
              {!servers.length && (
                <Button
                  variant="outline"
                  onClick={() => {
                    openForm()
                  }}
                >
                  {t('add')}
                </Button>
              )}
            </div>
          )}
        </div>
        <aside className={css.assistant}>
          <span className={css.eyebrow}>{t('ai')}</span>
          <h2>{t('inspect')}</h2>
          <p>{t('aiHint')}</p>
          <Button
            variant="primary"
            disabled={!server}
            onClick={() => {
              ask(false)
            }}
          >
            {t('inspect')}
          </Button>
          <div className={css.divider} />
          <h3>{t('analyze')}</h3>
          <p>{t('selectionHint')}</p>
          <Button
            variant="outline"
            disabled={!active || !selection[active.id]}
            onClick={() => {
              ask(true)
            }}
          >
            {t('analyze')}
          </Button>
        </aside>
      </div>
      <Modal
        open={!!form}
        title={t(form?.id ? 'edit' : 'add')}
        closeLabel={t('cancel')}
        onClose={() => {
          if (!busy) closeForm()
        }}
        className={css.formModal ?? ''}
        footer={
          <>
            <Button
              disabled={busy}
              onClick={() => {
                closeForm()
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              variant="primary"
              disabled={
                busy ||
                readingKey ||
                keyFileFailed ||
                !trusted ||
                !form?.fingerprint ||
                (form.auth === 'key' && !form.id && !keyFilename)
              }
              onClick={() => {
                if (form)
                  void run(async () => {
                    if (result(await props.save(form))) {
                      closeForm()
                      await refresh()
                    }
                  })
              }}
            >
              {t('save')}
            </Button>
          </>
        }
      >
        {form && (
          <div className={css.form}>
            <div className={css.formGrid}>
              {(['name', 'group', 'host', 'port', 'username'] as const).map(field => (
                <label key={field}>
                  {t(field)}
                  <Input
                    value={form[field]}
                    type={field === 'port' ? 'number' : 'text'}
                    onChange={(e) => {
                      patch(field, field === 'port' ? Number(e.target.value) : e.target.value)
                    }}
                  />
                </label>
              ))}
              <label>
                {t('auth')}
                <select
                  value={form.auth}
                  onChange={(e) => {
                    patch('auth', e.target.value)
                  }}
                >
                  <option value="password">{t('password')}</option>
                  <option value="key">{t('key')}</option>
                  <option value="agent">{t('agent')}</option>
                </select>
              </label>
            </div>
            {form.auth === 'password' && (
              <label>
                {t('password')}
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.secret}
                  placeholder={form.id ? t('retainSecret') : ''}
                  onChange={(e) => {
                    patch('secret', e.target.value)
                  }}
                />
              </label>
            )}
            {form.auth === 'key' && (
              <div className={css.keyFile}>
                <label>
                  {t('keyFile')}
                  <input
                    ref={keyInput}
                    hidden
                    type="file"
                    disabled={busy || readingKey}
                    aria-label={t('keyFile')}
                    onChange={(e) => {
                      const file = e.currentTarget.files?.[0]
                      e.currentTarget.value = ''
                      if (file) void selectKeyFile(file)
                    }}
                  />
                </label>
                <div className={css.fileRow}>
                  <Button
                    variant="outline"
                    disabled={busy || readingKey}
                    onClick={() => {
                      keyInput.current?.click()
                    }}
                  >
                    {t('chooseKeyFile')}
                  </Button>
                  <span>{keyFilename || (form.id ? t('savedKeyFile') : t('noKeyFile'))}</span>
                </div>
                <p className={css.hint}>{t('keyFileHint')}</p>
              </div>
            )}
            {form.auth === 'key' && (
              <label>
                {t('passphrase')}
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={form.passphrase}
                  onChange={(e) => {
                    patch('passphrase', e.target.value)
                  }}
                />
              </label>
            )}
            <div className={css.fingerprint}>
              <Button
                variant="outline"
                disabled={busy || !form.host}
                onClick={() => {
                  void run(async () => {
                    const r = await props.probe(form.host, form.port)
                    if (result(r)) {
                      setForm({ ...form, fingerprint: r.fingerprint ?? '' })
                      setTrusted(false)
                    }
                  })
                }}
              >
                {t('probe')}
              </Button>
              <code>{form.fingerprint}</code>
              <p>{t('trustHint')}</p>
              <label className={css.checkbox}>
                <input
                  type="checkbox"
                  checked={trusted}
                  disabled={!form.fingerprint}
                  onChange={(e) => {
                    setTrusted(e.target.checked)
                  }}
                />
                {t('trust')}
              </label>
            </div>
            {error && (
              <div className={css.notice} role="alert">
                {error}
              </div>
            )}
            <p className={css.hint}>{t('localHint')}</p>
          </div>
        )}
      </Modal>
      <Modal
        open={deleting}
        title={t('removeConfirm')}
        closeLabel={t('cancel')}
        onClose={() => {
          setDeleting(false)
        }}
        footer={
          <>
            <Button
              onClick={() => {
                setDeleting(false)
              }}
            >
              {t('cancel')}
            </Button>
            <Button
              disabled={busy}
              variant="primary"
              onClick={() => {
                if (server)
                  void run(async () => {
                    if (result(await props.remove(server.id))) {
                      setDeleting(false)
                      await refresh()
                    }
                  })
              }}
            >
              {t('remove')}
            </Button>
          </>
        }
      />
    </section>
  )
}
