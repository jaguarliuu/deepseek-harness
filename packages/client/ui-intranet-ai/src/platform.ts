/** Bounded platform HTTP client and serialized rotating account grants. */
import { createHash } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import { credentialKey } from '@deepseek-ai/dsh-credentials'
import { z } from 'zod'
import type { AccountStatus, AiSettings } from './types.ts'

const grantSchema = z.object({
  baseUrl: z.string(),
  account: z.string(),
  access: z.string().min(1),
  refresh: z.string().min(1),
  expires: z.number(),
})
const tokenSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string().min(1),
    refresh_token: z.string().min(1),
    expires_in: z.number().positive(),
  }),
})
/** Error that can cross the UI/model boundary without disclosing upstream data. */
export class AiFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
/**
 * Validate the configured platform origin before any credential is sent.
 * @param raw - configured origin.
 * @returns normalized origin.
 */
export function platformOrigin(raw: string): string {
  let url: URL
  try { url = new URL(raw) } catch (_invalidUrl) { throw new AiFailure('invalidUrl') }
  if (
    !['http:', 'https:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  )
    throw new AiFailure('invalidUrl')
  return url.origin
}
/**
 * Parse a bounded upstream JSON payload.
 * @param response - HTTP response.
 * @param maxBytes - allowed body bytes.
 * @returns parsed untrusted JSON.
 */
export async function boundedJson(response: Response, maxBytes: number): Promise<unknown> {
  const bytes = await boundedBytes(response, maxBytes)
  try {
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes))
    return value
  } catch (_invalidJson) {
    throw new AiFailure('invalidResponse')
  }
}
/**
 * Read a body within its byte limit.
 * @param response - HTTP response.
 * @param maxBytes - byte cap.
 * @returns complete bounded bytes.
 */
export async function boundedBytes(response: Response, maxBytes: number): Promise<Uint8Array> {
  if (!response.body) throw new AiFailure('invalidResponse')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const next = await reader.read()
      if (next.done) break
      size += next.value.length
      if (size > maxBytes) throw new AiFailure('tooLarge')
      chunks.push(next.value)
    }
  } finally {
    await reader.cancel().catch((_closed: unknown) => {
      /* The body may already be closed. */
    })
    reader.releaseLock()
  }
  const result = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}
/**
 * Normalize HTTP errors without returning upstream bodies.
 * @param status - HTTP status.
 * @returns safe category.
 */
export function httpFailure(status: number): AiFailure {
  return new AiFailure(
    (
      {
        400: 'invalidInput',
        401: 'authRequired',
        403: 'whitelist',
        404: 'notFound',
        422: 'invalidInput',
        429: 'rateLimited',
        503: 'unavailable',
      } as Record<number, string>
    )[status] ?? 'upstream',
  )
}
/** Platform connection; every request captures one endpoint and uses its own stored grant. */
export class PlatformClient {
  private readonly rootSignal: AbortSignal
  constructor(
    private readonly ctx: Context,
    private readonly settings: () => AiSettings,
    signal: AbortSignal,
    private readonly timeoutMs: number,
    private readonly maxResponseBytes: number,
  ) {
    this.rootSignal = signal
  }
  private key(base: string) {
    return credentialKey('intranet-ai', 'platform-' + createHash('sha256').update(base).digest('hex').slice(0, 24))
  }
  private async grant(base: string) {
    const record = await this.ctx.credentials.readRecord(this.key(base))
    const parsed = grantSchema.safeParse(record?.kind === 'grant' ? record.payload : null)
    return parsed.success && parsed.data.baseUrl === base ? parsed.data : undefined
  }
  private async raw(base: string, path: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
    try {
      return await fetch(new URL(path, base), {
        ...init,
        redirect: 'error',
        signal: AbortSignal.any([this.rootSignal, AbortSignal.timeout(this.timeoutMs), ...(signal ? [signal] : [])]),
      })
    } catch (_networkFailure) {
      throw new AiFailure(signal?.aborted || this.rootSignal.aborted ? 'interrupted' : 'network')
    }
  }
  /**
   * Check network health only; it does not prove account or whitelist access.
   * @param baseUrl - unsaved origin.
   */
  async health(baseUrl: string): Promise<void> {
    const response = await this.raw(platformOrigin(baseUrl), '/healthz', {})
    await response.body?.cancel()
    if (!response.ok) throw httpFailure(response.status)
  }
  /**
   * Return account presence without exposing credentials.
   * @returns account state.
   */
  async status(): Promise<AccountStatus> {
    if (!this.settings().baseUrl) return { connected: false, account: '' }
    const grant = await this.grant(platformOrigin(this.settings().baseUrl))
    return { connected: !!grant, account: grant?.account ?? '' }
  }
  /**
   * Authorize one platform account; the password is never persisted.
   * @param account - username/email/phone.
   * @param password - submitted password.
   */
  async login(account: string, password: string): Promise<void> {
    if (!account.trim() || !password) throw new AiFailure('invalidInput')
    const base = platformOrigin(this.settings().baseUrl)
    await this.ctx.credentials.modifyRecord(this.key(base), async () => {
      const response = await this.raw(base, '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: account.trim(), password }),
      })
      if (!response.ok) {
        await response.body?.cancel()
        throw httpFailure(response.status)
      }
      const data = tokenSchema.safeParse(await boundedJson(response, this.maxResponseBytes))
      if (!data.success) throw new AiFailure('invalidResponse')
      return {
        kind: 'grant',
        payload: {
          baseUrl: base,
          account: account.trim(),
          access: data.data.data.access_token,
          refresh: data.data.data.refresh_token,
          expires: Date.now() + data.data.data.expires_in * 1000,
        },
      }
    })
  }
  /** Clear local authorization and revoke the former grant if reachable. */
  async logout(): Promise<void> {
    const base = platformOrigin(this.settings().baseUrl)
    let old: z.infer<typeof grantSchema> | undefined
    await this.ctx.credentials.modifyRecord(this.key(base), async (current) => {
      const parsed = grantSchema.safeParse(current?.kind === 'grant' ? current.payload : null)
      if (parsed.success) old = parsed.data
      return Promise.resolve({ kind: 'grant' as const, payload: null })
    })
    if (old) {
      const response = await this.raw(base, '/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${old.access}` },
        body: JSON.stringify({ refresh_token: old.refresh }),
      })
      await response.body?.cancel()
      if (!response.ok) throw httpFailure(response.status)
    }
  }
  /**
   * Send one authenticated request, refreshing at most once after an explicit 401.
   * @param base - captured origin.
   * @param path - platform API path.
   * @param init - replayable request.
   * @param signal - caller cancellation.
   * @param expectedAccount - submitting account required for task-owned requests.
   * @returns HTTP response with a bounded reader owned by caller.
   */
  async request(
    base: string,
    path: string,
    init: RequestInit = {},
    signal?: AbortSignal,
    expectedAccount?: string,
  ): Promise<Response> {
    let grant = await this.grant(base)
    if (!grant) throw new AiFailure('authRequired')
    if (expectedAccount !== undefined && grant.account !== expectedAccount) throw new AiFailure('accountChanged')
    const account = grant.account
    const send = () => {
      if (!grant) throw new AiFailure('authRequired')
      return this.raw(
        base,
        path,
        {
          ...init,
          headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${grant.access}` },
        },
        signal,
      )
    }
    let response = await send()
    if (response.status === 401) {
      await response.body?.cancel()
      const rejectedAccess = grant.access
      await this.ctx.credentials.modifyRecord(this.key(base), async (current) => {
        const parsed = grantSchema.safeParse(current?.kind === 'grant' ? current.payload : null)
        if (!parsed.success) throw new AiFailure('authRequired')
        if (parsed.data.account !== account) throw new AiFailure('accountChanged')
        if (parsed.data.access !== rejectedAccess) {
          grant = parsed.data
          return undefined
        }
        const refreshed = await this.raw(
          base,
          '/api/auth/refresh',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh_token: parsed.data.refresh }),
          },
          signal,
        )
        if (!refreshed.ok) {
          await refreshed.body?.cancel()
          throw httpFailure(refreshed.status)
        }
        const token = tokenSchema.safeParse(await boundedJson(refreshed, this.maxResponseBytes))
        if (!token.success) throw new AiFailure('invalidResponse')
        grant = {
          ...parsed.data,
          access: token.data.data.access_token,
          refresh: token.data.data.refresh_token,
          expires: Date.now() + token.data.data.expires_in * 1000,
        }
        return { kind: 'grant', payload: grant }
      })
      await this.assertAccount(base, account)
      response = await send()
    }
    if (!response.ok) {
      await response.body?.cancel()
      throw httpFailure(response.status)
    }
    return response
  }
  /**
   * Reject a task belonging to a different endpoint or logged-in account.
   * @param base - task endpoint.
   * @param account - task account.
   */
  async assertAccount(base: string, account: string): Promise<void> {
    if (platformOrigin(this.settings().baseUrl) !== base || (await this.grant(base))?.account !== account)
      throw new AiFailure('accountChanged')
  }
}
