/** Host service for platform authorization, bounded AI tasks and local artifacts. */
import type { Context } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { PlatformClient } from './platform.ts'
import { TaskStore, failureCode } from './tasks.ts'
import { registerTools } from './tools.ts'
import type { AiArtifact, AiInput, AiResult, AiSettings, AiTask, AccountStatus } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    intranetAi: IntranetAi
  }
}
/** Deployment configuration; only non-secret settings are editable by the user. */
export interface Config {
  /** Platform origin. */
  baseUrl: Volatile<string>
  /** Allowed image model ids. */
  imageModels: Volatile<string[]>
  /** Allowed voice ids. */
  voices: Volatile<string[]>
  /** Profile-local task and output directory. */
  dataPath: string
  /** Per-request deadline. */
  requestTimeoutMs: number
  /** Poll interval for ordinary tasks. */
  pollMs: number
  /** Poll interval after extended queuing. */
  queuePollMs: number
  /** Maximum local monitoring duration; remote tasks remain resumable. */
  monitorMs: number
  /** Maximum parsed JSON bytes. */
  maxResponseBytes: number
  /** Maximum uploaded OCR file bytes. */
  maxUploadBytes: number
  /** Maximum downloaded output bytes. */
  maxArtifactBytes: number
  /** Maximum retained task records. */
  maxTasks: number
  /** Maximum records per list response. */
  listLimit: number
  /** Maximum OCR preview characters per task. */
  previewCharacters: number
}
/** Own the authenticated internal-AI platform connection and model tools. */
export default class IntranetAi extends TypertRemoteService {
  static inject = ['credentials', 'tools', 'jobs', 'fs']
  static Config = z.object({
    baseUrl: z.string().default('').volatile(),
    imageModels: z.array(z.string()).default(['Qwen-Image-2.1-Turbo', 'Qwen-Image-2.1']).volatile(),
    voices: z.array(z.string()).default(['vivian']).volatile(),
    dataPath: z.string().required(),
    requestTimeoutMs: z.number().min(1000).max(300000).default(120000),
    pollMs: z.number().min(300).default(1500),
    queuePollMs: z.number().min(1500).default(5000),
    monitorMs: z.number().min(1000).default(1200000),
    maxResponseBytes: z.number().min(1024).default(8388608),
    maxUploadBytes: z.number().min(1).max(20971520).default(20971520),
    maxArtifactBytes: z.number().min(1).default(31457280),
    maxTasks: z.number().min(1).default(500),
    listLimit: z.number().min(1).max(100).default(30),
    previewCharacters: z.number().min(100).max(10000).default(2000),
  })
  /** Platform request and credential owner; never exposed over Remote. */
  readonly platform: PlatformClient
  /** Durable task owner; model tools share the same records as the UI. */
  readonly tasks: TaskStore
  constructor(ctx: Context, config: Config) {
    super(ctx, 'intranetAi')
    const lifetime = new AbortController()
    const settings = (): AiSettings => ({
      baseUrl: config.baseUrl.get(),
      imageModels: [...config.imageModels.get()],
      voices: [...config.voices.get()],
    })
    this.platform = new PlatformClient(ctx, settings, lifetime.signal, config.requestTimeoutMs, config.maxResponseBytes)
    this.tasks = new TaskStore(this.platform, settings, config, lifetime.signal)
    registerTools(ctx, this, config.maxUploadBytes)
    ctx.effect(async () => {
      await this.tasks.ready
      return async () => {
        lifetime.abort()
        await this.tasks.close()
      }
    })
  }
  /**
   * Check an unsaved platform origin without sending credentials.
   * @param baseUrl - platform origin.
   * @returns network-only result.
   */
  @Remote
  async check(baseUrl: string): Promise<AiResult> {
    try {
      await this.platform.health(baseUrl)
      return { ok: true, code: 'healthy' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * Return the currently authorized account without exposing tokens.
   * @returns account state.
   */
  @Remote
  async account(): Promise<AccountStatus> {
    return this.platform.status()
  }
  /**
   * Sign in to the configured platform; the password is not persisted.
   * @param account - platform login id.
   * @param password - password.
   * @returns redacted result.
   */
  @Remote
  async login(account: string, password: string): Promise<AiResult> {
    try {
      await this.platform.login(account, password)
      return { ok: true, code: 'authorized' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * Remove local authorization and request server revocation.
   * @returns revocation result; local credentials are cleared even on network failure.
   */
  @Remote
  async logout(): Promise<AiResult> {
    try {
      await this.platform.logout()
      return { ok: true, code: 'disconnected' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * Submit a capability task and start local monitoring.
   * @param input - capability input; OCR bytes are transient.
   * @returns redacted submission status.
   */
  @Remote
  async submit(input: AiInput): Promise<AiResult> {
    try {
      const task = await this.tasks.submit(input)
      void this.tasks.monitor(task.id).catch((_monitorFailure: unknown) => {
        this.ctx.logger.warn('Internal AI monitor could not start; inspect the task and resume it from settings')
      })
      return { ok: true, code: 'submitted' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * List task projections for the authorized endpoint and account.
   * @returns current local tasks.
   */
  @Remote
  async list(): Promise<AiTask[]> {
    return this.tasks.list()
  }
  /**
   * Resume polling and artifact download without a second submission.
   * @param id - local task id.
   * @returns whether monitoring started.
   */
  @Remote
  async resume(id: string): Promise<AiResult> {
    try {
      const tasks = await this.tasks.list()
      if (!tasks.some(task => task.id === id && task.remoteId > 0)) return { ok: false, code: 'notFound' }
      void this.tasks.monitor(id).catch((_monitorFailure: unknown) => {
        this.ctx.logger.warn('Internal AI task could not resume; reconnect the platform account')
      })
      return { ok: true, code: 'resumed' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * Request server-confirmed task cancellation.
   * @param id - local task id.
   * @returns redacted cancellation result.
   */
  @Remote
  async cancel(id: string): Promise<AiResult> {
    try {
      await this.tasks.cancel(id)
      return { ok: true, code: 'cancelRequested' }
    } catch (error) {
      return { ok: false, code: failureCode(error) }
    }
  }
  /**
   * Read one account-owned local artifact.
   * @param id - local task id.
   * @param name - artifact filename.
   * @returns content for browser playback and download.
   */
  @Remote
  async artifact(id: string, name: string): Promise<AiArtifact> {
    return this.tasks.artifact(id, name)
  }
}
