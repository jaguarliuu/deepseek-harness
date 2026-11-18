/** Mail setup in the standard Desktop settings navigation. */
window.__ModuleLoader__.load({
  id: '@intranet/dsh-mail',
  factory(require) {
    const { createElement: h, useEffect, useState } = require('react')
    const { Button, Input, StateDot, Switch } = require('@deepseek-ai/dsh-client-ui-primitives')
    const route = '/api/intranet-mail.settings'
    const namespace = 'intranetMail'
    const en = {
      title: 'Mail', preferences: 'Mail preferences',
      account: 'Receiving mail', username: 'Email address or login', password: 'Password or app password',
      savedPassword: 'Leave blank to keep the saved password.', server: 'Server address', port: 'Port',
      smtp: 'Send mail from chat', smtpSetup: 'SMTP server', from: 'From address',
      security: 'Encryption', tls: 'TLS', starttls: 'STARTTLS', advanced: 'Company certificate',
      ca: 'Company CA certificate (PEM)', reminders: 'Small C alerts for new mail',
      model: 'Let AI search and read mail', modelHelp: 'Mail shared with AI can enter the model request and chat history.',
      test: 'Test connection', save: 'Save mailbox', testing: 'Checking the mail servers…', saving: 'Testing and saving…',
      loading: 'Loading mailbox settings…', retry: 'Reload settings', unconfigured: 'No mailbox connected', monitorError: 'Mailbox needs attention',
      tested: 'Connection test passed.', saved: 'Mailbox saved.', 'saved-inactive': 'Mailbox saved. Monitoring could not start. Check the mail data directory and save again.',
      ready: 'Mail monitoring active', checking: 'Waiting for the first mailbox check',
      paused: 'Small C alerts off', pending: 'Pending alerts: {count}',
      connection: 'Could not reach POP3. Check the server, port, VPN and certificate.',
      auth: 'POP3 login failed. Check your login and password.',
      uidl: 'Your POP3 server rejected UIDL. Contact your mail administrator.',
      smtpFailure: 'Could not verify SMTP. Check the outgoing server, encryption and password.',
      timeout: 'The POP3 check timed out. Check your network or VPN.',
      size: 'The mailbox listing exceeds the configured limit.',
      listing: 'The mail server returned an invalid listing.',
      pop3: 'POP3 check failed. Check the receiving server.',
      'pop3-password': 'Enter the password for the receiving server.',
      'smtp-password': 'Enter the password for the outgoing server.',
      credential: 'The mailbox credential is missing or invalid.',
      invalid: 'Check the addresses, port numbers and account fields.',
      busy: 'A mailbox change is already in progress. Try again in a moment.',
      conflict: 'The saved settings changed in another window. Reload before saving again.',
      storage: 'Could not read or save the mailbox. Check the local data directory and try again.',
      unavailable: 'Mailbox settings are unavailable. Check that the plugin is active and reload.',
    }
    const zh = {
      title: '邮箱', preferences: '邮件偏好',
      account: '收件设置', username: '邮箱账号或登录名', password: '密码或邮箱授权码',
      savedPassword: '留空可保留已保存的密码。', server: '服务器地址', port: '端口',
      smtp: '在聊天中发邮件', smtpSetup: 'SMTP 服务器', from: '发件邮箱地址',
      security: '加密方式', tls: 'TLS', starttls: 'STARTTLS', advanced: '企业证书',
      ca: '企业 CA 证书（PEM）', reminders: '收到新邮件时让小 C 提醒',
      model: '允许 AI 搜索和阅读邮件', modelHelp: '交给 AI 处理的邮件内容可能进入模型请求和聊天记录。',
      test: '测试连接', save: '保存邮箱', testing: '正在测试邮件服务器…', saving: '正在测试并保存…',
      loading: '正在加载邮箱设置…', retry: '重新加载', unconfigured: '尚未连接邮箱', monitorError: '需要检查邮箱',
      tested: '连接测试通过。', saved: '邮箱已保存。', 'saved-inactive': '邮箱已保存，但监控未能启动。请检查本地邮件数据目录后重新保存。',
      ready: '收件监控已开启', checking: '等待首次收件检查',
      paused: '小 C 提醒已关闭', pending: '待提醒 {count} 封',
      connection: '无法连接 POP3。请检查服务器、端口、VPN 和证书。',
      auth: 'POP3 登录失败。请检查登录名和密码。',
      uidl: 'POP3 服务器拒绝 UIDL。请联系邮箱管理员。',
      smtpFailure: 'SMTP 验证失败。请检查发件服务器、加密方式和密码。',
      timeout: 'POP3 检查超时。请检查网络或 VPN。',
      size: '邮件列表超出配置的大小限制。',
      listing: '邮件服务器返回了无效的列表。',
      pop3: 'POP3 检查失败。请检查收件服务器。',
      'pop3-password': '请输入收件服务器密码。',
      'smtp-password': '请输入发件服务器密码。',
      credential: '邮箱凭证缺失或无效。',
      invalid: '请检查服务器地址、端口和账号。',
      busy: '邮箱配置正在更新，请稍后再试。',
      conflict: '邮箱设置已在另一个窗口更新，请重新加载后再保存。',
      storage: '无法读取或保存邮箱。请检查本地数据目录后再试。',
      unavailable: '邮箱设置暂不可用。请检查插件是否启用，然后重新加载。',
    }

    async function request(data, signal) {
      const response = await fetch(route, {
        signal,
        ...(data ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) } : {}),
      })
      if (!response.ok) throw new Error('unavailable')
      return response.json()
    }

    function makeDraft(view) {
      return {
        pop3: { host: '', username: '', port: 995, ...view.pop3, password: '' },
        smtp: { host: '', username: '', port: 587, security: 'starttls', from: '', ...view.smtp, password: '' },
        smtpEnabled: !!view.smtp,
        reminders: view.reminders,
        allowModelRead: view.allowModelRead,
      }
    }

    function Field({ label, hint, children }) {
      return h('label', { className: 'intranet-mail-field' }, h('span', null, label), children,
        hint && h('small', null, hint))
    }

    function ConnectionFields({ t, kind, endpoint, update, saved }) {
      const outbound = kind === 'smtp'
      const input = (key, label, attributes = {}, hint) => h(Field, { label: t(label), hint },
        h(Input, { value: endpoint[key], onChange: event => update(key, event.target.value), ...attributes }))
      return h('div', { className: 'intranet-mail-fields' },
        h('div', { className: 'intranet-mail-pair' },
          input('username', 'username', { required: true, autoComplete: 'username' }),
          input('password', 'password', { type: 'password', autoComplete: 'off', maxLength: 4096 }, saved && t('savedPassword'))),
        h('div', { className: 'intranet-mail-server' },
          input('host', 'server', { required: true, autoCapitalize: 'none', spellCheck: false }),
          input('port', 'port', { type: 'number', min: 1, max: 65535, required: true })),
        outbound && h('div', { className: 'intranet-mail-pair' },
          input('from', 'from', { required: true, type: 'email' }),
          h(Field, { label: t('security') },
            h('select', { value: endpoint.security, onChange: event => update('security', event.target.value) },
              h('option', { value: 'starttls' }, t('starttls')),
              h('option', { value: 'tls' }, t('tls'))))),
        h('details', null, h('summary', null, t('advanced')),
          h(Field, { label: t('ca') }, h('textarea', {
            value: endpoint.ca ?? '', rows: 3, spellCheck: false, maxLength: 32768,
            onChange: event => update('ca', event.target.value),
          }))))
    }

    function Preference({ label, detail, checked, onChange, children }) {
      return h('div', { className: 'intranet-mail-preference' },
        h('div', { className: 'intranet-mail-preference-control' },
          h('div', null, h('span', null, label), detail && h('p', null, detail)),
          h(Switch, { checked, onChange, label })),
        children)
    }

    function MailSettings({ t, load }) {
      const [view, setView] = useState()
      const [draft, setDraft] = useState()
      const [result, setResult] = useState('')
      const [busy, setBusy] = useState('')
      const [loadAttempt, reload] = useState(0)

      useEffect(() => {
        const signal = new AbortController()
        load(undefined, signal.signal).then(value => {
          if (!signal.signal.aborted) {
            setView(value)
            setDraft(makeDraft(value))
          }
        }, () => { if (!signal.signal.aborted) setResult('unavailable') })
        return () => signal.abort()
      }, [load, loadAttempt])

      useEffect(() => {
        if (!view?.pop3) return
        const controller = new AbortController()
        const timer = setInterval(() => {
          load(undefined, controller.signal).then(next => {
            if (!controller.signal.aborted) setView(current => current?.revision === next.revision
              ? { ...current, status: next.status } : current)
          }, () => { /* Keep the last reported monitoring status on a transient read failure. */ })
        }, 5000)
        return () => { clearInterval(timer); controller.abort() }
      }, [load, view?.revision, !!view?.pop3])

      function field(kind, key, value) {
        setResult('')
        setDraft(current => ({ ...current, [kind]: { ...current[kind], [key]: value } }))
      }

      function toggle(key) {
        setResult('')
        setDraft(current => {
          const next = { ...current, [key]: !current[key] }
          if (key === 'smtpEnabled' && next.smtpEnabled && !current.smtp.username) {
            next.smtp = { ...current.smtp, username: current.pop3.username,
              from: current.pop3.username.includes('@') ? current.pop3.username : '' }
          }
          return next
        })
      }

      async function submit(event) {
        event.preventDefault()
        if (busy) return
        const action = event.nativeEvent.submitter?.value === 'test' ? 'test' : 'save'
        setResult('')
        setBusy(action)
        const endpoint = ({ port, ...rest }) => ({ ...rest, port: Number(port) })
        try {
          const answer = await load({
            action, revision: view.revision, pop3: endpoint(draft.pop3),
            ...(draft.smtpEnabled ? { smtp: endpoint(draft.smtp) } : {}),
            reminders: draft.reminders, allowModelRead: draft.allowModelRead,
          })
          setResult(answer.code)
          if (answer.view) {
            setView(answer.view)
            setDraft(makeDraft(answer.view))
          }
        } catch {
          setResult('unavailable')
        } finally {
          setBusy('')
        }
      }

      function reloadSettings() {
        setResult('')
        setView(undefined)
        setDraft(undefined)
        reload(current => current + 1)
      }

      const feedback = result === 'smtp' ? 'smtpFailure' : result
      const success = ['tested', 'saved'].includes(result)
      const statusCode = view?.status?.code
      const status = statusCode && Object.hasOwn(en, statusCode) ? statusCode : 'unconfigured'
      const state = status === 'ready' ? 'done' : status === 'checking' ? 'ongoing'
        : status === 'unconfigured' ? 'idle' : 'error'
      const statusLabel = view?.reminders === false && status === 'ready' ? 'paused' : status
      const statusTone = statusLabel === 'paused' ? 'idle' : state
      return h('section', { className: 'intranet-mail-settings' },
        h('header', { className: 'intranet-mail-header' }, h('h2', null, t('title')),
          draft && h('span', { className: 'intranet-mail-status', role: 'status' },
            h(StateDot, { state: statusTone, size: 8 }),
            t(state === 'error' ? 'monitorError' : statusLabel))),
        !draft ? h('div', { className: 'intranet-mail-loading', role: result ? 'alert' : 'status' }, t(result || 'loading'),
          result && h(Button, { variant: 'outline', onClick: reloadSettings }, t('retry'))) : h('form', { onSubmit: submit },
          h('fieldset', { disabled: !!busy, className: 'intranet-mail-form' },
            h('section', { className: 'intranet-mail-card' },
              h('div', { className: 'intranet-mail-card-head' }, h('h3', null, t('account')),
                h('span', { className: 'intranet-mail-protocol' }, 'POP3')),
              state === 'error' && h('p', { role: 'status' }, t(status)),
              h(ConnectionFields, { t, kind: 'pop3', endpoint: draft.pop3, saved: !!view.pop3,
                update: (key, value) => field('pop3', key, value) })),
            h('section', { className: 'intranet-mail-card intranet-mail-preferences' },
              h('h3', null, t('preferences')),
              h(Preference, { checked: draft.reminders, onChange: () => toggle('reminders'), label: t('reminders'),
                detail: view.status?.pending > 0 && t('pending').replace('{count}', view.status.pending) }),
              h(Preference, { checked: draft.smtpEnabled, onChange: () => toggle('smtpEnabled'), label: t('smtp') },
                draft.smtpEnabled && h('section', { className: 'intranet-mail-outbound' },
                  h('h4', null, t('smtpSetup')),
                  h(ConnectionFields, { t, kind: 'smtp', endpoint: draft.smtp, saved: !!view.smtp,
                    update: (key, value) => field('smtp', key, value) }))),
              h(Preference, { checked: draft.allowModelRead, onChange: () => toggle('allowModelRead'), label: t('model'),
                detail: t('modelHelp') }))),
          h('footer', null,
            h('div', { className: 'intranet-mail-feedback' },
              h('p', { role: feedback && !success ? 'alert' : 'status' },
                busy ? t(busy === 'test' ? 'testing' : 'saving') : feedback ? t(Object.hasOwn(en, feedback) ? feedback : 'storage') : null),
              result === 'conflict' && h(Button, { type: 'button', onClick: reloadSettings }, t('retry'))),
            h('div', { className: 'intranet-mail-actions' },
              h(Button, { variant: 'outline', type: 'submit', value: 'test', disabled: !!busy }, t('test')),
              h(Button, { variant: 'primary', type: 'submit', value: 'save', disabled: !!busy }, t('save'))))))
    }

    const css = `
.intranet-mail-settings { container: intranet-mail / inline-size; max-width: 720px; min-width: 0; padding-bottom: 20px; color: var(--dsw-alias-label-primary); }
.intranet-mail-settings h2, .intranet-mail-settings h3, .intranet-mail-settings h4, .intranet-mail-settings p { margin: 0; }
.intranet-mail-settings h2 { font-size: 22px; line-height: 30px; font-weight: 500; color: var(--dsw-alias-brand-text); }
.intranet-mail-settings h3, .intranet-mail-settings h4 { font-size: 14px; line-height: 22px; font-weight: 500; }
.intranet-mail-settings p { color: var(--dsw-alias-label-secondary); overflow-wrap: anywhere; }
.intranet-mail-header, .intranet-mail-card-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
.intranet-mail-header { margin-bottom: 16px; }
.intranet-mail-status, .intranet-mail-protocol { display: inline-flex; align-items: center; gap: 6px; border: 0.5px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-sm); background: var(--dsw-alias-settings-card-fill); padding: 2px 8px; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 18px; }
.intranet-mail-settings form, .intranet-mail-form, .intranet-mail-card, .intranet-mail-fields { display: grid; min-width: 0; gap: 12px; }
.intranet-mail-form { border: 0; padding: 0; margin: 0; }
.intranet-mail-card { padding: 16px 18px; border: 0.5px solid var(--dsw-alias-settings-card-stroke); border-radius: var(--dsw-radius-xl); background: var(--dsw-alias-settings-card-fill); }
.intranet-mail-field { display: grid; align-content: start; gap: 5px; min-width: 0; color: var(--dsw-alias-label-primary); font-size: 13px; }
.intranet-mail-field small { color: var(--dsw-alias-label-secondary); font-size: 12px; }
.intranet-mail-pair, .intranet-mail-server { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.intranet-mail-server { grid-template-columns: minmax(0, 1fr) minmax(82px, 112px); }
.intranet-mail-field textarea, .intranet-mail-field select { min-width: 0; padding: 5px 8px; border: 0.5px solid var(--dsw-alias-border-l4); border-radius: var(--dsw-radius-md); color: inherit; background: var(--dsw-alias-bg-layer-1); font: inherit; }
.intranet-mail-fields summary { width: fit-content; max-width: 100%; color: var(--dsw-alias-label-secondary); font-size: 13px; cursor: pointer; }
.intranet-mail-fields details > label { margin-top: 8px; }
.intranet-mail-preferences { gap: 0; padding-block: 12px; }
.intranet-mail-preferences h3 { padding-bottom: 4px; }
.intranet-mail-preference + .intranet-mail-preference { border-top: 0.5px solid var(--dsw-alias-settings-card-stroke); }
.intranet-mail-preference-control { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 12px; padding-block: 10px; font-size: 14px; }
.intranet-mail-preference-control p { margin-top: 2px; font-size: 12px; line-height: 18px; }
.intranet-mail-outbound { display: grid; gap: 10px; padding: 12px; margin: 0 0 10px; background: var(--dsw-alias-bg-layer-1); border-radius: var(--dsw-radius-lg); }
.intranet-mail-settings footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 12px; min-width: 0; }
.intranet-mail-feedback { flex: 1 1 180px; min-width: 0; font-size: 13px; }
.intranet-mail-feedback:has(p:empty):not(:has(button)) { flex-basis: 0; }
.intranet-mail-actions, .intranet-mail-loading { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.intranet-mail-actions { margin-inline-start: auto; }
.intranet-mail-settings [role='alert'] { color: var(--dsw-alias-state-error-primary); }
@container intranet-mail (width < 440px) {
  .intranet-mail-pair { grid-template-columns: minmax(0, 1fr); }
  .intranet-mail-card { padding-inline: 12px; }
  .intranet-mail-server { grid-template-columns: minmax(0, 1fr) 76px; gap: 8px; }
}
@media (pointer: coarse) {
  .intranet-mail-settings input, .intranet-mail-settings textarea, .intranet-mail-settings select { font-size: 16px; }
}
`

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(() => ctx.locale.register(namespace, { zh, en, ja: en, es: en, fr: en, de: en, ru: en, pt: en }))
        ctx.effect(() => {
          const style = document.createElement('style')
          style.textContent = css
          document.head.append(style)
          return () => style.remove()
        })
        ctx.slots.inject('settings.section', () => ctx.slots.register({
          name: 'settings.section', id: 'mail', order: 25, locale: namespace,
          label: () => ctx.locale.bind(namespace)('title'), inject: () => ({ load: request }),
        }, MailSettings))
      },
    }
  },
})
