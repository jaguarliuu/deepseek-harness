/** Owner-only mailbox setup, with account credentials committed in one record. */
import { randomUUID } from 'node:crypto'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { z } from 'zod'
import { MailError, withPop3 } from './pop3.js'

const route = '/api/intranet-mail.settings'
const accountKey = 'intranet-mail/account'
const endpoint = {
  host: z.string().trim().min(1).max(253),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1).max(254),
  ca: z.string().trim().max(32_768).optional(),
}
const password = z.string().max(4096).optional()
const draftSchema = z.strictObject({
  action: z.enum(['test', 'save']),
  revision: z.string(),
  pop3: z.strictObject({ ...endpoint, password }),
  smtp: z.strictObject({ ...endpoint, password, from: z.email(), security: z.enum(['tls', 'starttls']) }).optional(),
  reminders: z.boolean(),
  allowModelRead: z.boolean(),
})

function publicEndpoint(value) {
  if (!value) return undefined
  const { credential: _reference, ...output } = value
  return output
}

function sameEndpoint(before, after, kind) {
  return before && after && before.host === after.host && before.port === after.port
    && before.username === after.username && before.ca === after.ca
    && (kind === 'pop3' || before.security === after.security)
}

/** Mount the legacy or saved mailbox and register setup on the authenticated carrier. */
export async function registerMailboxSettings(ctx, options, legacy, schema, mount, smtpTransport) {
  const lifetime = new AbortController()
  const profile = ctx.get?.('profileContext')
  const stateDirectory = options.stateDirectory ?? join(profile?.home ?? join(homedir(), '.dsh'), 'mail')
  let saved
  let runtime
  let activationError = false
  let active
  ctx.effect(() => async () => {
    lifetime.abort()
    await active
    await runtime?.dispose?.()
  })

  function stored(record) {
    if (record === undefined) return undefined
    const payload = record.kind === 'grant' && record.payload
    if (!payload || typeof payload.revision !== 'string') throw new MailError('storage', 'Invalid saved mail account.')
    return {
      revision: payload.revision,
      config: schema.parse(payload.config),
      passwords: z.object({ pop3: password, smtp: password }).parse(payload.passwords),
    }
  }

  function activate(account) {
    try {
      runtime = account ? mount(account.config, account.passwords) : undefined
      activationError = false
    } catch {
      activationError = true
      ctx.logger('intranet-mail').warn('Cannot open the saved mail account. Check its data directory.')
    }
  }

  async function replaceAccount(account) {
    const previous = runtime
    runtime = undefined
    saved = account
    try {
      await previous?.dispose()
      if (!lifetime.signal.aborted) activate(saved ?? (legacy && { config: legacy }))
    } catch {
      activationError = true
      ctx.logger('intranet-mail').warn('Cannot replace the active mail account. Restart the Host to load saved settings.')
    }
  }

  saved = stored(await ctx.credentials.readRecord(accountKey))
  lifetime.signal.throwIfAborted()
  activate(saved ?? (legacy && { config: legacy }))

  function view() {
    const config = saved?.config ?? legacy
    return {
      revision: saved?.revision ?? '',
      pop3: publicEndpoint(config?.pop3),
      smtp: publicEndpoint(config?.smtp),
      reminders: config?.reminders ?? true,
      allowModelRead: config?.allowModelRead ?? false,
      ...activationError ? { status: { code: 'storage', pending: 0 } } : { status: runtime?.status() },
    }
  }

  async function resolvePassword(kind, draft, previous) {
    if (draft.password) return draft.password
    if (sameEndpoint(previous?.config[kind], draft, kind)) {
      const literal = previous.passwords?.[kind]
      if (literal) return literal
      const existing = await ctx.credentials.resolve(previous.config[kind].credential)
      if (existing) return existing.value
    }
    throw new MailError(`${kind}-password`, 'Enter the password for this mail server.')
  }

  async function change(request) {
    const parsed = draftSchema.safeParse(await request.json())
    if (!parsed.success) return { code: 'invalid' }
    const draft = parsed.data
    if (draft.revision !== (saved?.revision ?? '')) return { code: 'conflict' }
    const previous = saved ?? (legacy && { config: legacy })
    const passwords = {}
    const endpoints = {}
    for (const kind of ['pop3', 'smtp']) {
      if (!draft[kind]) continue
      const { password: _password, ...endpoint } = draft[kind]
      if (!endpoint.ca) delete endpoint.ca
      endpoints[kind] = { ...endpoint, credential: `INTRANET_MAIL_${kind.toUpperCase()}_PASSWORD` }
      passwords[kind] = await resolvePassword(kind, { ...endpoint, password: draft[kind].password }, previous)
    }
    const config = schema.parse({
      ...options, ...endpoints, smtp: endpoints.smtp, stateDirectory,
      reminders: draft.reminders, allowModelRead: draft.allowModelRead,
    })
    const signal = AbortSignal.any([request.signal, lifetime.signal])
    await withPop3({ ...config.pop3, timeoutMs: config.timeoutMs, maxListingBytes: config.maxListingBytes },
      passwords.pop3, signal, () => undefined)
    if (config.smtp) {
      const transport = smtpTransport(config, passwords.smtp)
      try {
        await transport.verify()
      } catch {
        return { code: 'smtp' }
      } finally {
        transport.close()
      }
    }
    signal.throwIfAborted()
    if (draft.action === 'test') return { code: 'tested' }

    const next = { revision: randomUUID(), config, passwords }
    await ctx.credentials.modifyRecord(accountKey, async record => {
      if ((stored(record)?.revision ?? '') !== draft.revision) throw new MailError('conflict', 'Mailbox settings changed.')
      return { kind: 'grant', payload: JSON.parse(JSON.stringify(next)) }
    })
    await replaceAccount(next)
    return { code: activationError ? 'saved-inactive' : 'saved', view: view() }
  }

  ctx.inject(['connection'], scope => scope.effect(() => scope.connection.fetch.register({
    path: route, methods: ['GET', 'POST'], requestBody: 'buffered',
    async fetch(request) {
      const response = result => Response.json(result, { headers: { 'cache-control': 'no-store' } })
      if (active) return response(request.method === 'GET' ? view() : { code: 'busy' })
      if (request.method === 'GET') {
        active = (async () => {
          const current = stored(await ctx.credentials.readRecord(accountKey))
          if (current?.revision !== saved?.revision) await replaceAccount(current)
          return view()
        })().catch(() => undefined)
      } else {
        active = change(request).catch(error => ({
          code: error instanceof MailError ? error.code : error instanceof SyntaxError || error instanceof z.ZodError ? 'invalid' : 'storage',
        }))
      }
      try {
        const result = await active
        return result ? response(result) : new Response(null, { status: 500 })
      } finally {
        active = undefined
      }
    },
  })))
}
