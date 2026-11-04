/** Local credential-backed connection inventory; model readers receive metadata only. */
import type { Context } from '@deepseek-ai/cordis'
import { parseCredentialKey } from '@deepseek-ai/dsh-credentials'
import ssh2 from 'ssh2'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { ServerId, ServerInput, ServerView } from './types.ts'
const viewSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  group: z.string().max(100),
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .refine(v => !/[\s/@]/u.test(v)),
  port: z.number().int().min(1).max(65535),
  username: z.string().trim().min(1).max(100),
  auth: z.enum(['password', 'key', 'agent']),
  fingerprint: z.string().regex(/^SHA256:[A-Za-z0-9+/]{43}$/u),
})
const storedSchema = viewSchema.extend({ secret: z.string().max(65536), passphrase: z.string().max(4096) })
const recordsSchema = z.array(storedSchema).max(200)
const key = parseCredentialKey('ui-remote-ops/servers')
/** Normalize failures without returning SSH library diagnostics or credentials. */
export class OpsFailure extends Error {
  constructor(readonly code: string) {
    super(code)
  }
}
/** Validated private inventory entry, retained exclusively by the local Host. */
export type StoredServer = z.infer<typeof storedSchema>
/**
 * Remove credential fields from a private entry.
 * @param entry - local private entry.
 * @returns public connection metadata.
 */
export function publicServer(entry: StoredServer): ServerView {
  const { secret: _secret, passphrase: _passphrase, ...view } = entry
  return { ...view, id: view.id as ServerId }
}
/** Read and mutate one provider-owned grant under its existing cross-process lock. */
export class ServerRepository {
  constructor(private readonly ctx: Context) {}
  /**
   * Read validated private entries; corrupt data stops access instead of overwriting it.
   * @returns private local records.
   */
  async records(): Promise<StoredServer[]> {
    const record = await this.ctx.credentials.readRecord(key)
    if (!record) return []
    if (record.kind !== 'grant') throw new OpsFailure('storageFailed')
    const parsed = recordsSchema.safeParse(record.payload)
    if (!parsed.success) throw new OpsFailure('storageFailed')
    return parsed.data
  }
  /**
   * List metadata with credential fields removed.
   * @returns public server entries.
   */
  async list(): Promise<ServerView[]> {
    return (await this.records()).map(publicServer)
  }
  /**
   * Resolve a local entry; ids never resolve hostnames or credentials supplied by a model.
   * @param id - saved server id.
   * @returns private stored connection.
   */
  async get(id: string): Promise<StoredServer> {
    const entry = (await this.records()).find(v => v.id === id)
    if (!entry) throw new OpsFailure('notFound')
    return entry
  }
  /**
   * Save a confirmed fingerprint and credentials. Blank secrets retain existing ones only for unchanged authentication targets.
   * @param input - local form data.
   * @returns redacted saved entry.
   */
  async save(input: ServerInput): Promise<ServerView> {
    let saved: StoredServer | undefined
    await this.ctx.credentials.modifyRecord(key, async (record) => {
      if (record && record.kind !== 'grant') throw new OpsFailure('storageFailed')
      const entries = record ? recordsSchema.parse(record.payload) : []
      const old = input.id ? entries.find(v => v.id === input.id) : undefined
      if (input.id && !old) throw new OpsFailure('notFound')
      const same =
        old &&
        old.host === input.host &&
        old.port === input.port &&
        old.username === input.username &&
        old.auth === input.auth
      const parsed = storedSchema.safeParse({
        ...input,
        id: input.id ?? randomUUID(),
        secret: input.secret || (same ? old.secret : ''),
        passphrase: input.secret ? input.passphrase : same ? old.passphrase : input.passphrase,
      })
      if (!parsed.success || (parsed.data.auth !== 'agent' && !parsed.data.secret)) throw new OpsFailure('invalidInput')
      if (input.auth === 'key' && input.secret) {
        const parsedKey = ssh2.utils.parseKey(input.secret, input.passphrase || undefined)
        if (parsedKey instanceof Error || Array.isArray(parsedKey) || !parsedKey.getPrivatePEM())
          throw new OpsFailure('invalidKeyFile')
      }
      saved = parsed.data
      const next = entries.filter(v => v.id !== parsed.data.id)
      next.push(saved)
      if (next.length > 200) throw new OpsFailure('limitReached')
      return Promise.resolve({ kind: 'grant' as const, payload: next })
    })
    if (!saved) throw new OpsFailure('storageFailed')
    return publicServer(saved)
  }
  /**
   * Remove a server and its credentials atomically.
   * @param id - saved server id.
   */
  async remove(id: ServerId): Promise<void> {
    await this.ctx.credentials.modifyRecord(key, async (record) => {
      if (!record) return Promise.resolve(undefined)
      if (record.kind !== 'grant') throw new OpsFailure('storageFailed')
      return Promise.resolve({
        kind: 'grant' as const,
        payload: recordsSchema.parse(record.payload).filter(v => v.id !== id),
      })
    })
  }
}
