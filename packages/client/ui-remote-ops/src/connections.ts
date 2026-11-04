/** Cross-platform SSH transport: isolated command channels and bounded interactive sessions. */
import ssh2, { type Client, type ClientChannel, type ConnectConfig } from 'ssh2'
import { createHash, randomUUID } from 'node:crypto'
import { StringDecoder } from 'node:string_decoder'
import { z } from 'zod'
import { OpsFailure, type StoredServer } from './repository.ts'
import type { CommandResult, ServerId, TerminalId, TerminalView } from './types.ts'
/** Deployment limits shared by UI and model command channels. */
export interface ConnectionLimits {
  /** SSH handshake and authentication deadline in milliseconds. */
  connectTimeoutMs: number
  /** Maximum duration of one remote command in milliseconds. */
  commandTimeoutMs: number
  /** Maximum retained characters per terminal or command result. */
  outputCharacters: number
  /** Maximum open or opening interactive terminals per Host. */
  maxTerminals: number
}
interface ManagedClient {
  client: Client
  closed: Promise<void>
}
interface TerminalRecord {
  id: TerminalId
  serverId: ServerId
  stream: ClientChannel
  owner: ManagedClient
  data: string
  cursor: number
  state: TerminalView['state']
}
const endpointSchema = z.object({
  host: z
    .string()
    .trim()
    .min(1)
    .max(253)
    .refine(v => !/[\s/@]/u.test(v)),
  port: z.number().int().min(1).max(65535),
})
/**
 * Compute the standard OpenSSH SHA-256 fingerprint from a raw public host key.
 * @param raw - SSH server public key bytes.
 * @returns display fingerprint.
 */
export function hostFingerprint(raw: Buffer): string {
  return `SHA256:${createHash('sha256').update(raw).digest('base64').replace(/=+$/u, '')}`
}
/** Own every socket and PTY until its close event; never reconnect or replay commands. */
export class Connections {
  private readonly clients = new Set<ManagedClient>()
  private readonly terminals = new Map<TerminalId, TerminalRecord>()
  private disposed = false
  private pendingTerminals = 0
  constructor(private readonly limits: ConnectionLimits) {}
  private allocate(): ManagedClient {
    if (this.disposed) throw new OpsFailure('closed')
    const client = new ssh2.Client()
    const closed = new Promise<void>(resolve =>
      client.once('close', () => {
        this.clients.delete(owner)
        resolve()
      }),
    )
    const owner = { client, closed }
    this.clients.add(owner)
    // SSH emits late transport errors after readiness; operations own user-facing outcomes.
    client.on('error', (_transportError: Error) => {
      /* Ready/close listeners settle the owning operation. */
    })
    return owner
  }
  private options(server: StoredServer): ConnectConfig {
    if (server.auth === 'key' && ssh2.utils.parseKey(server.secret, server.passphrase || undefined) instanceof Error)
      throw new OpsFailure('invalidInput')
    if (server.auth === 'agent' && !process.env.SSH_AUTH_SOCK && process.platform !== 'win32')
      throw new OpsFailure('invalidInput')
    return {
      host: server.host,
      port: server.port,
      username: server.username,
      readyTimeout: this.limits.connectTimeoutMs,
      keepaliveInterval: 15000,
      keepaliveCountMax: 3,
      hostVerifier: (raw: Buffer) => hostFingerprint(raw) === server.fingerprint,
      ...(server.auth === 'password'
        ? { password: server.secret }
        : server.auth === 'key'
          ? { privateKey: server.secret, ...(server.passphrase ? { passphrase: server.passphrase } : {}) }
          : {
            agent:
                process.env.SSH_AUTH_SOCK ?? (process.platform === 'win32' ? '\\\\.\\pipe\\openssh-ssh-agent' : ''),
          }),
    }
  }
  private async open(server: StoredServer, signal?: AbortSignal): Promise<ManagedClient> {
    signal?.throwIfAborted()
    const options = this.options(server)
    const owner = this.allocate()
    try {
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          owner.client.destroy()
          reject(new OpsFailure('interrupted'))
        }
        const error = () => {
          reject(new OpsFailure('connectionFailed'))
        }
        const close = () => {
          reject(new OpsFailure('connectionFailed'))
        }
        const ready = () => {
          resolve()
        }
        signal?.addEventListener('abort', abort, { once: true })
        owner.client.once('ready', ready).once('error', error).once('close', close)
        void owner.closed.finally(() => signal?.removeEventListener('abort', abort))
        try {
          owner.client.connect(options)
        } catch (_invalidKey: unknown) {
          reject(new OpsFailure('invalidInput'))
          owner.client.destroy()
        }
      })
      if (this.disposed || signal?.aborted) throw new OpsFailure('interrupted')
      return owner
    } catch (error) {
      owner.client.destroy()
      await owner.closed
      throw error
    }
  }
  /**
   * Retrieve an untrusted host fingerprint without authenticating or sending secrets.
   * @param endpoint - host and port.
   * @returns fingerprint requiring out-of-band confirmation.
   */
  async probe(endpoint: { host: string; port: number }): Promise<string> {
    const parsed = endpointSchema.safeParse(endpoint)
    if (!parsed.success) throw new OpsFailure('invalidInput')
    const owner = this.allocate()
    let fingerprint = ''
    try {
      await new Promise<void>((resolve) => {
        owner.client
          .once('error', () => {
            resolve()
          })
          .once('close', () => {
            resolve()
          })
        owner.client.connect({
          ...parsed.data,
          username: 'fingerprint-probe',
          readyTimeout: this.limits.connectTimeoutMs,
          hostVerifier: (raw: Buffer) => {
            fingerprint = hostFingerprint(raw)
            return false
          },
        })
      })
    } finally {
      owner.client.destroy()
      await owner.closed
    }
    if (!fingerprint) throw new OpsFailure('connectionFailed')
    return fingerprint
  }
  /**
   * Authenticate against a pinned host without starting a command.
   * @param server - private saved entry.
   */
  async test(server: StoredServer): Promise<void> {
    const owner = await this.open(server)
    owner.client.end()
    await owner.closed
  }
  /**
   * Open an interactive PTY on its own SSH connection.
   * @param server - private saved entry.
   * @returns opaque terminal identity.
   */
  async connect(server: StoredServer): Promise<TerminalId> {
    if (this.terminals.size + this.pendingTerminals >= this.limits.maxTerminals) throw new OpsFailure('limitReached')
    this.pendingTerminals++
    try {
      return await this.openTerminal(server)
    } finally {
      this.pendingTerminals--
    }
  }
  private async openTerminal(server: StoredServer): Promise<TerminalId> {
    const owner = await this.open(server)
    try {
      const stream = await new Promise<ClientChannel>((resolve, reject) =>
        owner.client.shell({ term: 'xterm-256color', cols: 100, rows: 30 }, (error, value) => {
          if (error) reject(new OpsFailure('connectionFailed'))
          else resolve(value)
        }),
      )
      const id = randomUUID() as TerminalId
      const record: TerminalRecord = {
        id,
        serverId: server.id as ServerId,
        owner,
        stream,
        data: '',
        cursor: 0,
        state: 'connected',
      }
      this.terminals.set(id, record)
      const decoder = new StringDecoder('utf8')
      const append = (chunk: Buffer) => {
        const text = decoder.write(chunk)
        record.cursor += text.length
        record.data = (record.data + text).slice(-this.limits.outputCharacters)
      }
      stream.on('data', append)
      stream.stderr.on('data', append)
      stream.once('error', () => {
        record.state = 'failed'
        owner.client.destroy()
      })
      stream.once('close', () => {
        if (record.state === 'connected') record.state = 'closed'
        owner.client.end()
      })
      owner.client.once('close', () => {
        if (record.state === 'connected') record.state = 'failed'
      })
      return id
    } catch (error) {
      owner.client.destroy()
      await owner.closed
      throw error
    }
  }
  private terminal(id: TerminalId): TerminalRecord {
    const value = this.terminals.get(id)
    if (!value) throw new OpsFailure('notFound')
    return value
  }
  /**
   * Read only output after a cursor, reporting buffer loss explicitly.
   * @param id - interactive terminal identity.
   * @param cursor - last consumed absolute cursor.
   * @returns incremental terminal view.
   */
  read(id: TerminalId, cursor: number): TerminalView {
    if (!Number.isSafeInteger(cursor) || cursor < 0) throw new OpsFailure('invalidInput')
    const t = this.terminal(id)
    if (cursor > t.cursor) throw new OpsFailure('invalidInput')
    const start = t.cursor - t.data.length
    return {
      id,
      serverId: t.serverId,
      data: t.data.slice(Math.max(0, cursor - start)),
      cursor: t.cursor,
      truncated: cursor < start,
      state: t.state,
    }
  }
  /**
   * Write user keystrokes, with optional terminal dimensions; never called by model tools.
   * @param id - terminal identity.
   * @param data - bounded user input.
   * @param cols - columns.
   * @param rows - rows.
   */
  write(id: TerminalId, data: string, cols: number, rows: number): void {
    if (
      typeof data !== 'string' ||
      data.length > 65536 ||
      !Number.isInteger(cols) ||
      !Number.isInteger(rows) ||
      cols < 2 ||
      cols > 500 ||
      rows < 2 ||
      rows > 300
    )
      throw new OpsFailure('invalidInput')
    const t = this.terminal(id)
    if (t.state !== 'connected') throw new OpsFailure('closed')
    t.stream.setWindow(rows, cols, 0, 0)
    if (data) t.stream.write(data)
  }
  /**
   * Close a terminal and await transport shutdown; remote detached work may continue.
   * @param id - terminal identity.
   */
  async disconnect(id: TerminalId): Promise<void> {
    const t = this.terminal(id)
    t.state = 'closed'
    t.owner.client.destroy()
    await t.owner.closed
    this.terminals.delete(id)
  }
  /**
   * Run one approved command on an isolated connection; output and duration are bounded.
   * @param server - pinned saved entry.
   * @param command - exact approved command.
   * @param signal - caller cancellation, absent for a caller without cancellation.
   * @returns exit status or explicit interrupted/unknown outcome.
   */
  async execute(server: StoredServer, command: string, signal?: AbortSignal): Promise<CommandResult> {
    if (!command.trim() || command.length > 32768) throw new OpsFailure('invalidInput')
    const deadline = AbortSignal.timeout(this.limits.commandTimeoutMs)
    const combined = signal ? AbortSignal.any([signal, deadline]) : deadline
    const owner = await this.open(server, combined)
    let output = '',
      exitCode: number | null = null,
      truncated = false,
      completed = false
    const decoder = new StringDecoder('utf8')
    const append = (chunk: Buffer) => {
      const text = decoder.write(chunk)
      if (output.length + text.length > this.limits.outputCharacters) truncated = true
      output = (output + text).slice(0, this.limits.outputCharacters)
    }
    const abort = () => {
      owner.client.destroy()
    }
    combined.addEventListener('abort', abort, { once: true })
    try {
      if (combined.aborted) abort()
      else
        owner.client.exec(command, (error, stream) => {
          if (error) {
            owner.client.destroy()
            return
          }
          stream.on('data', append)
          stream.stderr.on('data', append)
          stream.once('error', () => owner.client.destroy())
          stream.once('exit', (code: number | null) => {
            exitCode = code
          })
          stream.once('close', () => {
            completed = true
            owner.client.end()
          })
        })
      await owner.closed
      return { output, exitCode, interrupted: combined.aborted || !completed, truncated }
    } finally {
      combined.removeEventListener('abort', abort)
      owner.client.destroy()
      await owner.closed
    }
  }
  /** Close and join every socket before releasing local credential and UI dependencies. */
  async close(): Promise<void> {
    this.disposed = true
    const clients = [...this.clients]
    for (const owner of clients) owner.client.destroy()
    await Promise.all(clients.map(owner => owner.closed))
    this.terminals.clear()
  }
}
