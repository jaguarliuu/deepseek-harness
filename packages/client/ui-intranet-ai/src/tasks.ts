/** Durable local task monitoring and bounded artifact downloads. */
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { brandString } from '@deepseek-ai/dsh-brand'
import type { AiArtifact, AiInput, AiSettings, AiTask, AiTaskId } from './types.ts'
import { AiFailure, boundedBytes, boundedJson, PlatformClient, platformOrigin } from './platform.ts'

const statusSchema = z.enum(['queued', 'running', 'succeeded', 'failed', 'canceled'])
const recordSchema = z.object({
  id: z.number().int().positive(),
  status: statusSchema,
  error: z.string().nullish(),
  images: z.array(z.object({ url: z.string() })).optional(),
  audio_url: z.string().nullish(),
  markdown: z.string().optional(),
  n_pages: z.number().int().nonnegative().optional(),
  total_pages: z.number().int().nonnegative().optional(),
  truncated: z.boolean().optional(),
})
const savedTaskSchema = z.object({
  id: z.uuid().transform(value => brandString<AiTaskId>(value)),
  capability: z.enum(['image', 'tts', 'ocr']),
  remoteId: z.number().int().nonnegative(),
  baseUrl: z.string(),
  account: z.string(),
  status: z.string(),
  notice: z.string(),
  files: z.array(z.string()),
  markdown: z.string(),
  previewTruncated: z.boolean().default(false),
  totalPages: z.number(),
  pages: z.number(),
  truncated: z.boolean(),
})
const diskSchema = z.object({ version: z.literal(1), tasks: z.array(savedTaskSchema) })
const submitSchema = z.object({ id: z.number().int().positive(), status: statusSchema })
/** Validate tool/wire inputs before sending them upstream. */
export const inputSchema = z.object({
  capability: z.enum(['image', 'tts', 'ocr']),
  text: z.string().max(2000),
  model: z.string().optional(),
  size: z
    .string()
    .regex(/^\d{2,5}x\d{2,5}$/u)
    .optional(),
  n: z.number().int().min(1).max(3).optional(),
  voice: z.string().optional(),
  speed: z.number().min(0.25).max(4).optional(),
  instructions: z.string().max(2000).optional(),
  filename: z.string().max(200).optional(),
  fileBase64: z.string().optional(),
})
/** Local task store limits supplied by deployment configuration. */
export interface TaskOptions {
  /** Host-owned persistence and artifact directory. */
  dataPath: string
  /** Maximum JSON response bytes. */
  maxResponseBytes: number
  /** Maximum upload bytes. */
  maxUploadBytes: number
  /** Maximum downloaded artifact bytes. */
  maxArtifactBytes: number
  /** Delay between routine status checks. */
  pollMs: number
  /** Delay after extended queuing. */
  queuePollMs: number
  /** Deadline for local monitoring, preserving remote work for later resume. */
  monitorMs: number
  /** Maximum retained task records; never silently evicts records. */
  maxTasks: number
  /** Maximum records returned by a list request. */
  listLimit: number
  /** Maximum Markdown characters in a list projection. */
  previewCharacters: number
}
/**
 * Normalize only known, non-secret failure codes.
 * @param error - caught failure.
 * @returns safe code.
 */
export function failureCode(error: unknown): string {
  return error instanceof AiFailure
    ? error.code
    : error instanceof Error && error.name === 'AbortError'
      ? 'interrupted'
      : 'localFailure'
}
/** Store and resume tasks without duplicating submissions after an unknown outcome. */
export class TaskStore {
  private tasks: AiTask[] = []
  private writes: Promise<void> = Promise.resolve()
  private readonly active = new Map<string, Promise<AiTask>>()
  /** Resolves after task-index validation and startup recovery. */
  readonly ready: Promise<void>
  constructor(
    private readonly platform: PlatformClient,
    private readonly settings: () => AiSettings,
    private readonly options: TaskOptions,
    private readonly signal: AbortSignal,
  ) {
    this.ready = this.load()
  }
  private async load(): Promise<void> {
    await mkdir(this.options.dataPath, { recursive: true, mode: 0o700 })
    let raw: string
    try {
      raw = await readFile(join(this.options.dataPath, 'tasks.json'), 'utf8')
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return
      throw error
    }
    this.tasks = diskSchema.parse(JSON.parse(raw)).tasks
    for (const task of this.tasks) {
      if (!task.remoteId && task.status === 'submitting') {
        task.status = 'unknown'
        task.notice = 'submissionUnknown'
      }
    }
    await this.save()
  }
  private save(): Promise<void> {
    this.writes = this.writes
      .catch((_priorWrite: unknown) => {
        /* The next caller retries a complete snapshot. */
      })
      .then(async () => {
        const path = join(this.options.dataPath, 'tasks.json')
        await writeFile(path + '.tmp', JSON.stringify({ version: 1, tasks: this.tasks }), { mode: 0o600 })
        await rename(path + '.tmp', path)
      })
    return this.writes
  }
  /**
   * Read only tasks belonging to the current authorized account.
   * @returns fresh task projections.
   */
  async list(): Promise<AiTask[]> {
    await this.ready
    const status = await this.platform.status()
    return this.tasks
      .filter(
        t =>
          t.baseUrl === this.settings().baseUrl.replace(/\/$/u, '') && t.account === status.account && status.connected,
      )
      .slice(0, this.options.listLimit)
      .map(t => ({
        ...t,
        files: [...t.files],
        markdown: t.markdown.slice(0, this.options.previewCharacters),
        previewTruncated: t.previewTruncated || t.markdown.length > this.options.previewCharacters,
      }))
  }
  private async owned(id: string): Promise<AiTask> {
    await this.ready
    const task = this.tasks.find(t => t.id === id)
    if (!task) throw new AiFailure('notFound')
    await this.platform.assertAccount(task.baseUrl, task.account)
    return task
  }
  /**
   * Submit a task once, retaining an uncertain outcome instead of resubmitting.
   * @param input - validated task input.
   * @param signal - caller cancellation.
   * @returns local task.
   */
  async submit(input: AiInput, signal?: AbortSignal): Promise<AiTask> {
    await this.ready
    const parsed = inputSchema.safeParse(input)
    if (!parsed.success) throw new AiFailure('invalidInput')
    input = parsed.data
    const settings = this.settings()
    const base = platformOrigin(settings.baseUrl)
    const account = await this.platform.status()
    if (!account.connected) throw new AiFailure('authRequired')
    if (this.tasks.length >= this.options.maxTasks) throw new AiFailure('taskLimit')
    let init: RequestInit
    let path: string
    if (input.capability === 'ocr') {
      if (
        !input.filename ||
        !input.fileBase64 ||
        input.fileBase64.length > Math.ceil(this.options.maxUploadBytes / 3) * 4 ||
        !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(input.fileBase64)
      )
        throw new AiFailure('invalidInput')
      const bytes = Buffer.from(input.fileBase64, 'base64')
      if (
        !bytes.length ||
        bytes.length > this.options.maxUploadBytes ||
        !/\.(pdf|png|jpe?g|webp|bmp|tiff?)$/iu.test(input.filename)
      )
        throw new AiFailure('invalidInput')
      const ext = (input.filename.split('.').pop() ?? '').toLowerCase()
      const mime =
        (
          {
            pdf: 'application/pdf',
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            webp: 'image/webp',
            bmp: 'image/bmp',
            tif: 'image/tiff',
            tiff: 'image/tiff',
          } as Record<string, string>
        )[ext] ?? 'application/octet-stream'
      const form = new FormData()
      form.append('file', new Blob([bytes], { type: mime }), input.filename)
      init = { method: 'POST', body: form }
      path = '/api/ocr/parse'
    } else {
      if (!input.text.trim()) throw new AiFailure('invalidInput')
      let body: object
      if (input.capability === 'image') {
        const model = input.model || settings.imageModels[0]
        if (!model || !settings.imageModels.includes(model)) throw new AiFailure('invalidInput')
        body = { prompt: input.text, model, size: input.size || '1024x1024', n: input.n ?? 1 }
        path = '/api/image/generate'
      } else {
        const voice = input.voice || settings.voices[0]
        if (!voice || !settings.voices.includes(voice)) throw new AiFailure('invalidInput')
        body = {
          text: input.text,
          voice,
          speed: input.speed ?? 1,
          instructions: input.instructions ?? '',
          format: 'wav',
          sample_rate: 24000,
        }
        path = '/api/tts/speech'
      }
      init = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    }
    const task: AiTask = {
      id: brandString<AiTaskId>(randomUUID()),
      capability: input.capability,
      baseUrl: base,
      account: account.account,
      remoteId: 0,
      status: 'submitting',
      notice: '',
      files: [],
      markdown: '',
      previewTruncated: false,
      pages: 0,
      totalPages: 0,
      truncated: false,
    }
    this.tasks.unshift(task)
    await this.save()
    try {
      await this.platform.assertAccount(base, account.account)
      const response = await this.platform.request(base, path, init, signal, account.account)
      const raw = await boundedJson(response, this.options.maxResponseBytes)
      const wrapped = z.object({ success: z.literal(true), data: submitSchema })
      const result = input.capability === 'image' ? submitSchema.parse(raw) : wrapped.parse(raw).data
      task.remoteId = result.id
      task.status = result.status
      await this.save()
      return { ...task, files: [...task.files] }
    } catch (error) {
      task.notice =
        error instanceof AiFailure && ['invalidInput', 'authRequired', 'whitelist', 'rateLimited', 'accountChanged'].includes(error.code)
          ? error.code
          : 'submissionUnknown'
      task.status = task.notice === 'submissionUnknown' ? 'unknown' : 'failed'
      await this.save()
      throw new AiFailure(task.notice)
    }
  }
  /**
   * Resume monitoring an already submitted task; duplicate callers share one monitor.
   * @param id - local task id.
   * @param signal - optional local monitoring cancellation.
   * @returns final or interrupted task.
   */
  async monitor(id: string, signal?: AbortSignal): Promise<AiTask> {
    const prior = this.active.get(id)
    if (prior) return prior
    const pending = this.poll(id, signal).finally(() => {
      this.active.delete(id)
    })
    this.active.set(id, pending)
    return pending
  }
  private async poll(id: string, callerSignal?: AbortSignal): Promise<AiTask> {
    const task = await this.owned(id)
    if (!task.remoteId) throw new AiFailure('submissionUnknown')
    const signal = AbortSignal.any([this.signal, ...(callerSignal ? [callerSignal] : [])])
    const until = Date.now() + this.options.monitorMs
    try {
      while (true) {
        signal.throwIfAborted()
        await this.platform.assertAccount(task.baseUrl, task.account)
        const response = await this.platform.request(
          task.baseUrl,
          `/api/${task.capability}/history/${task.remoteId}`,
          {},
          signal,
          task.account,
        )
        const result = recordSchema.parse(await boundedJson(response, this.options.maxResponseBytes))
        if (result.id !== task.remoteId) throw new AiFailure('invalidResponse')
        task.status = result.status
        task.notice = result.error ? (result.status === 'succeeded' ? 'partialFailure' : 'taskFailed') : ''
        if (result.status === 'succeeded') {
          task.markdown = result.markdown ?? ''
          task.pages = result.n_pages ?? 0
          task.totalPages = result.total_pages ?? 0
          task.truncated = result.truncated ?? false
          if (task.capability === 'ocr' && !task.markdown.trim()) throw new AiFailure('emptyResult')
          if (task.capability === 'image' && !result.images?.length) throw new AiFailure('emptyResult')
          if (task.capability === 'tts' && !result.audio_url) throw new AiFailure('emptyResult')
          const dir = join(this.options.dataPath, task.id)
          await mkdir(dir, { recursive: true, mode: 0o700 })
          if (task.capability === 'ocr') {
            await writeFile(join(dir, 'document.md'), task.markdown, { mode: 0o600 })
            task.previewTruncated = task.markdown.length > this.options.previewCharacters
            task.markdown = task.markdown.slice(0, this.options.previewCharacters)
            task.files = ['document.md']
          } else {
            const urls =
              task.capability === 'image'
                ? (result.images ?? []).map(x => x.url)
                : result.audio_url
                  ? [result.audio_url]
                  : []
            task.files = []
            for (const [i, raw] of urls.entries()) {
              const url = new URL(raw, task.baseUrl)
              if (
                url.origin !== task.baseUrl ||
                !url.pathname.startsWith('/static/') ||
                url.username ||
                url.password ||
                url.hash
              )
                throw new AiFailure('invalidArtifact')
              const downloaded = await this.platform.request(
                task.baseUrl,
                url.pathname + url.search,
                {},
                signal,
                task.account,
              )
              const mime = downloaded.headers.get('content-type')?.split(';')[0]
              const ext =
                task.capability === 'tts'
                  ? 'wav'
                  : ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[
                    mime ?? ''
                  ]
              if (!ext) {
                await downloaded.body?.cancel()
                throw new AiFailure('invalidArtifact')
              }
              const name = `result-${i + 1}.${ext}`
              const bytes = await boundedBytes(downloaded, this.options.maxArtifactBytes)
              if (
                task.capability === 'tts' &&
                (!['audio/wav', 'audio/x-wav', 'audio/wave', 'application/octet-stream'].includes(mime ?? '') ||
                  new TextDecoder().decode(bytes.slice(0, 4)) !== 'RIFF' ||
                  new TextDecoder().decode(bytes.slice(8, 12)) !== 'WAVE')
              )
                throw new AiFailure('invalidArtifact')
              await writeFile(join(dir, name), bytes, { mode: 0o600 })
              task.files.push(name)
            }
          }
        }
        await this.save()
        if (['succeeded', 'failed', 'canceled'].includes(task.status)) return { ...task, files: [...task.files] }
        if (Date.now() >= until) throw new AiFailure('monitorTimeout')
        await delay(
          Date.now() > until - this.options.monitorMs + 30000 ? this.options.queuePollMs : this.options.pollMs,
          undefined,
          { signal },
        )
      }
    } catch (error) {
      task.notice = failureCode(error)
      if (task.status === 'succeeded') task.notice = 'downloadFailed'
      await this.save()
      return { ...task, files: [...task.files] }
    }
  }
  /**
   * Cancel remote work and retain the server-confirmed status.
   * @param id - local task id.
   */
  async cancel(id: string): Promise<void> {
    const task = await this.owned(id)
    if (!task.remoteId) throw new AiFailure('submissionUnknown')
    const response = await this.platform.request(
      task.baseUrl,
      `/api/${task.capability}/${task.remoteId}/cancel`,
      { method: 'POST' },
      this.signal,
      task.account,
    )
    const result = z
      .object({ success: z.literal(true), status: statusSchema })
      .parse(await boundedJson(response, this.options.maxResponseBytes))
    task.status = result.status
    await this.save()
  }
  /**
   * Read a known local artifact for authorized playback/download.
   * @param id - local task id.
   * @param name - artifact filename.
   * @returns bounded bytes and type.
   */
  async artifact(id: string, name: string): Promise<AiArtifact> {
    const task = await this.owned(id)
    if (!task.files.includes(name) || !/^(result-\d+\.(png|jpg|webp|wav)|document\.md)$/u.test(name))
      throw new AiFailure('notFound')
    const bytes = await readFile(join(this.options.dataPath, task.id, name))
    if (bytes.length > this.options.maxArtifactBytes) throw new AiFailure('tooLarge')
    return {
      name,
      base64: bytes.toString('base64'),
      mime: name.endsWith('.wav')
        ? 'audio/wav'
        : name.endsWith('.md')
          ? 'text/markdown'
          : name.endsWith('.jpg')
            ? 'image/jpeg'
            : name.endsWith('.webp')
              ? 'image/webp'
              : 'image/png',
    }
  }
  /**
   * Describe saved files for the model without embedding large binary or OCR data.
   * @param task - completed local task.
   * @returns bounded completion JSON.
   */
  modelResult(task: AiTask): string {
    return JSON.stringify({
      id: task.id,
      capability: task.capability,
      status: task.status,
      notice: task.notice,
      files: task.files.map(name => join(this.options.dataPath, task.id, name)),
      markdown: task.markdown.slice(0, 12000),
      previewTruncated: task.previewTruncated || task.markdown.length > 12000,
      pages: task.pages,
      totalPages: task.totalPages,
      truncated: task.truncated,
    })
  }
  /** Drain monitors and persistence after the owning service aborts. */
  async close(): Promise<void> {
    await Promise.allSettled(this.active.values())
    await this.writes
  }
}
