/** Local SSH workspace service. Credentials never cross a model-facing API. */
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { Connections, type ConnectionLimits } from './connections.ts'
import { OpsFailure, ServerRepository } from './repository.ts'
import { registerTools } from './tools.ts'
import type { OpsResult, ServerId, ServerInput, ServerView, TerminalId, TerminalView } from './types.ts'
declare module '@deepseek-ai/cordis' {
  interface Context {
    remoteOps: RemoteOps
  }
}
/** Runtime resource limits; authentication is configured through the local workspace. */
export interface Config extends ConnectionLimits {}
/** Own local server inventory, SSH transports and approved model tools. */
export default class RemoteOps extends TypertRemoteService {
  static inject = ['credentials', 'tools', 'approval']
  static Config = z.object({
    connectTimeoutMs: z.number().min(1000).max(120000).default(15000),
    commandTimeoutMs: z.number().min(1000).max(600000).default(120000),
    outputCharacters: z.number().min(1024).max(1048576).default(131072),
    maxTerminals: z.number().min(1).max(30).default(8),
  })
  /** Local credential record owner; not exposed over RPC. */
  readonly repository: ServerRepository
  /** Socket and terminal owner; not exposed over RPC. */
  readonly connections: Connections
  constructor(ctx: Context, config: Config) {
    super(ctx, 'remoteOps')
    this.repository = new ServerRepository(ctx)
    this.connections = new Connections(config)
    ctx.effect(() => () => this.connections.close())
    registerTools(ctx, this)
  }
  /**
   * List local servers without credential fields.
   * @returns saved connection metadata without secrets.
   */
  @Remote
  async list(): Promise<ServerView[]> {
    return this.repository.list()
  }
  /**
   * Probe an untrusted host without credentials.
   * @param host - server address.
   * @param port - SSH port.
   * @returns untrusted fingerprint or redacted error.
   */
  @Remote
  async probe(host: string, port: number): Promise<OpsResult> {
    try {
      return { ok: true, code: 'probed', fingerprint: await this.connections.probe({ host, port }) }
    } catch (error) {
      return failure(error)
    }
  }
  /**
   * Save local credentials with an explicitly confirmed server fingerprint.
   * @param input - user connection form.
   * @returns redacted save outcome.
   */
  @Remote
  async save(input: ServerInput): Promise<OpsResult> {
    try {
      await this.repository.save(input)
      return { ok: true, code: 'saved' }
    } catch (error) {
      return failure(error)
    }
  }
  /**
   * Remove an unused connection; open terminals must be disconnected first.
   * @param id - saved server id.
   * @returns redacted removal outcome.
   */
  @Remote
  async deleteServer(id: ServerId): Promise<OpsResult> {
    try {
      await this.repository.remove(id)
      return { ok: true, code: 'removed' }
    } catch (error) {
      return failure(error)
    }
  }
  /**
   * Verify saved credentials against the pinned host.
   * @param id - saved server id.
   * @returns authentication outcome.
   */
  @Remote
  async test(id: ServerId): Promise<OpsResult> {
    try {
      await this.connections.test(await this.repository.get(id))
      return { ok: true, code: 'tested' }
    } catch (error) {
      return failure(error)
    }
  }
  /**
   * Start an interactive terminal, isolated from AI command channels.
   * @param id - saved server id.
   * @returns terminal identity.
   */
  @Remote
  async connect(id: ServerId): Promise<TerminalId> {
    return this.connections.connect(await this.repository.get(id))
  }
  /**
   * Read bounded output after a cursor.
   * @param id - terminal identity.
   * @param cursor - consumed character cursor.
   * @returns terminal status and incremental output.
   */
  @Remote
  read(id: TerminalId, cursor: number): Promise<TerminalView> {
    return Promise.resolve(this.connections.read(id, cursor))
  }
  /**
   * Send manual keyboard input or resize the PTY.
   * @param id - terminal identity.
   * @param data - user keystrokes, empty for resize only.
   * @param cols - columns.
   * @param rows - rows.
   */
  @Remote
  write(id: TerminalId, data: string, cols: number, rows: number): Promise<void> {
    this.connections.write(id, data, cols, rows)
    return Promise.resolve()
  }
  /**
   * Close an interactive terminal without replaying any commands.
   * @param id - terminal identity.
   */
  @Remote
  async disconnect(id: TerminalId): Promise<void> {
    await this.connections.disconnect(id)
  }
}
function failure(error: unknown): OpsResult {
  return { ok: false, code: error instanceof OpsFailure ? error.code : 'localFailure' }
}
