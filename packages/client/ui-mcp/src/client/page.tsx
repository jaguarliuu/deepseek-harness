/** MCP connection list and staged editor. */
import { useState } from 'react'
import { Button, Input, Modal, IconPlusOutlineRegular, type SettingsFormScopeSnapshot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-mcp/remote'
import { serverSchema, type McpServer, type McpSettings } from '../config.ts'
import css from './page.module.css'

import type { ProbeResult } from '../types.ts'
/** Renderer-injected state and operations owned by the MCP settings plugin. */
export interface McpSettingsFace {
  hooks: {
    configuration: HostObservable<SettingsFormScopeSnapshot<McpSettings>>
    activity: HostObservable<{ saving: boolean; result: 'saved' | 'saveFailed' | null }>
  }
  save(servers: McpServer[], revision: number | undefined): Promise<boolean>
  test(server: McpServer): Promise<ProbeResult>
}
type Props = PropsRuntime<'settings.section'> & PropsLocale<'settings.mcp'> & InjectFace<McpSettingsFace>
type Editor = { original: string | null; server: McpServer; servers: McpServer[]; revision: number | undefined }

function ConnectionEditor({ editor, t, save, test, close, saving }: {
  editor: Editor
  t: Props['t']
  save: Props['save']
  test: Props['test']
  close: () => void
  saving: boolean
}) {
  const [server, setServer] = useState(editor.server)
  const [headers, setHeaders] = useState(JSON.stringify(server.headers, null, 2))
  const [args, setArgs] = useState(JSON.stringify(server.args))
  const [env, setEnv] = useState(JSON.stringify(server.env, null, 2))
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<ProbeResult | null>(null)
  const [invalid, setInvalid] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)
  const busy = saving || testing
  const update = (patch: Partial<McpServer>): void => { setServer(value => ({ ...value, ...patch })); setResult(null); setInvalid(false) }
  const resolve = (): McpServer | undefined => {
    try {
      const headerValue: unknown = JSON.parse(headers)
      const argValue: unknown = JSON.parse(args)
      const envValue: unknown = JSON.parse(env)
      const parsed = serverSchema.safeParse({ ...server, headers: headerValue, args: argValue, env: envValue })
      if (!parsed.success || editor.servers.some(item => item.name === parsed.data.name && item.name !== editor.original)) return undefined
      return parsed.data
    } catch (_invalidJson) { return undefined }
  }
  const check = async (): Promise<void> => {
    const value = resolve()
    if (!value) { setInvalid(true); return }
    setTesting(true); setResult(null); setInvalid(false)
    try { setResult(await test(value)) } catch (_testFailure) { setResult({ ok: false, code: 'connection' }) }
    finally { setTesting(false) }
  }
  const submit = async (): Promise<void> => {
    const value = resolve()
    if (!value) { setInvalid(true); return }
    const servers = editor.original === null ? [...editor.servers, value]
      : editor.servers.map(item => item.name === editor.original ? value : item)
    setSaveFailed(false)
    if (await save(servers, editor.revision)) close()
    else setSaveFailed(true)
  }
  return <Modal open title={t(editor.original === null ? 'add' : 'edit')} closeLabel={t('close')}
    onClose={() => { if (!busy) close() }} className={css.dialog ?? ''} contentClassName={css.dialogContent ?? ''}
    footer={<div className={css.actions}>
      <Button disabled={busy} onClick={() => { void check() }}>{t(testing ? 'testing' : 'test')}</Button>
      <Button variant="primary" disabled={busy} onClick={() => { void submit() }}>{t(saving ? 'saving' : 'save')}</Button>
    </div>}>
    <div className={css.form}>
      <label>{t('name')}<Input value={server.name} disabled={busy} onChange={(event) => { update({ name: event.target.value }) }} /></label>
      <p className={css.hint}>{t('nameHint')}</p>
      <label>{t('transport')}<select value={server.transport} disabled={busy}
        onChange={(event) => { update({ transport: event.target.value === 'stdio' ? 'stdio' : 'streamable-http' }) }}>
        <option value="streamable-http">{t('http')}</option><option value="stdio">{t('stdio')}</option>
      </select></label>
      {server.transport === 'streamable-http'
        ? <label>{t('url')}<Input value={server.url} placeholder="https://mcp.company.local/mcp" disabled={busy}
          onChange={(event) => { update({ url: event.target.value }) }} /></label>
        : <><p className={css.hint}>{t('localHint')}</p>
          <label>{t('command')}<Input value={server.command} disabled={busy} onChange={(event) => { update({ command: event.target.value }) }} /></label>
          <label>{t('args')}<textarea value={args} disabled={busy} onChange={(event) => { setArgs(event.target.value); setResult(null) }} /></label>
        </>}
      <details><summary>{t('advanced')}</summary><div className={css.form}>
        {server.transport === 'streamable-http'
          ? <label>{t('headers')}<textarea value={headers} autoComplete="off" spellCheck={false} disabled={busy}
            onChange={(event) => { setHeaders(event.target.value); setResult(null) }} /></label>
          : <><label>{t('env')}<textarea value={env} autoComplete="off" spellCheck={false} disabled={busy}
            onChange={(event) => { setEnv(event.target.value); setResult(null) }} /></label>
          <label>{t('cwd')}<Input value={server.cwd} disabled={busy} onChange={(event) => { update({ cwd: event.target.value }) }} /></label></>}
        <label>{t('timeout')}<Input type="number" min={1} max={300} value={server.timeoutMs / 1000} disabled={busy}
          onChange={(event) => { update({ timeoutMs: Number(event.target.value) * 1000 }) }} /></label>
        <p className={css.hint}>{t('secrets')}</p>
      </div></details>
      {saveFailed && <p role="alert" className={css.notice}>{t('saveFailed')}</p>}
      {invalid && <p role="alert" className={css.notice}>{t('invalid')}</p>}
      {result && (result.ok ? <div role="status" className={css.notice}><p>{t('success')}</p>
        {result.tools.length ? <ul>{result.tools.map(tool => <li key={tool}>{tool}</li>)}</ul> : <p>{t('noTools')}</p>}
      </div> : <p role="alert" className={css.notice}>{t(result.code === 'timeout' ? 'timeoutError' : result.code)}</p>)}
    </div>
  </Modal>
}

/** Render configuration and keep unsaved drafts scoped to an explicit editor instance. */
export function McpSettingsPage(props: Props) {
  const { t, save, test } = props
  const config = props.useConfiguration(value => value)
  const activity = props.useActivity(value => value)
  const [editor, setEditor] = useState<Editor | null>(null)
  const [removing, setRemoving] = useState<McpServer | null>(null)
  const servers = config.value?.servers ?? []
  const locked = !config.writable || activity.saving
  const edit = (server?: McpServer): void => { setEditor({ original: server?.name ?? null, revision: config.revision, servers,
    server: server ?? { name: '', enabled: true, transport: 'streamable-http', url: '', headers: {}, command: '', args: [], env: {}, cwd: '', timeoutMs: 15000 } }) }
  return <section className={css.page}>
    <p className={css.brand}>{t('brand')}</p>
    <div className={css.heading}><div><h2>{t('title')}</h2><p className={css.hint}>{t('intro')}</p></div>
      <Button variant="primary" disabled={locked || config.status !== 'ready'} icon={<IconPlusOutlineRegular size={16} />}
        onClick={() => { edit() }}>{t('add')}</Button></div>
    {config.status === 'loading' ? <p>{t('loading')}</p> : config.status !== 'ready' ? <p role="alert">{t('unavailable')}</p> : <>
      {!config.writable && <p>{t('readOnly')}</p>}
      {!servers.length && <div className={css.empty}><h3>{t('empty')}</h3><p>{t('emptyHint')}</p></div>}
      {servers.map(server => <article key={server.name} className={css.card}>
        <div className={css.description}><div className={css.row}><h3>{server.name}</h3>
          <span className={css.badge} data-enabled={server.enabled}>{t(server.enabled ? 'enabled' : 'disabled')}</span></div>
        <p className={css.hint}>{t(server.transport === 'stdio' ? 'stdio' : 'http')}</p>
        <p className={css.endpoint}>{server.transport === 'stdio' ? server.command : server.url.split('?')[0]}</p></div>
        <div className={css.actions}><Button disabled={locked} onClick={() => { edit(server) }}>{t('edit')}</Button>
          <Button disabled={locked} onClick={() => { void save(servers.map(item => item.name === server.name
            ? { ...item, enabled: !item.enabled } : item), config.revision) }}>{t(server.enabled ? 'disable' : 'enable')}</Button>
          <Button disabled={locked} onClick={() => { setRemoving(server) }}>{t('remove')}</Button></div>
      </article>)}
    </>}
    {activity.result && <p role={activity.result === 'saveFailed' ? 'alert' : 'status'} className={css.hint}>{t(activity.result)}</p>}
    {editor && <ConnectionEditor editor={editor} t={t} save={save} test={test}
      saving={activity.saving} close={() => { setEditor(null) }} />}
    {removing && <Modal open title={t('removeTitle')} description={t('removeHint')} closeLabel={t('close')}
      onClose={() => { if (!activity.saving) setRemoving(null) }}
      footer={<Button disabled={activity.saving} onClick={() => {
        void save(servers.filter(item => item.name !== removing.name), config.revision)
          .then((ok) => { if (ok) setRemoving(null) }) }}>{t('remove')}</Button>} />}
  </section>
}
