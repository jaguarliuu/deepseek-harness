/** Durable SSH monitoring with independent background collection and model queries. */
import type { ServerId } from '@deepseek-ai/dsh-client-ui-remote-ops/types'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { setTimeout as delay } from 'node:timers/promises'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import type { Domain } from '@deepseek-ai/dsh-storage-domain'
import type {} from '@deepseek-ai/dsh-client-ui-remote-ops'
import { enrollment, monitorDomain } from './spec.ts'
import { parseMetrics, templates, templateMap } from './templates.ts'
import { withNetworkRates } from './rates.ts'
import { registerTools } from './tools.ts'
import type { Config, Dashboard, Monitor, Sample, TemplateId } from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { opsMonitor: OpsMonitor }
}
/** Expected monitoring failures; no command output or credentials enter diagnostics. */
export class MonitorError extends Error {
  constructor(readonly code: 'closed' | 'storage' | 'capacity' | 'missing' | 'targetChanged') {
    super(`Monitoring ${code}; check the monitoring dashboard before retrying`)
  }
}
/** Own enrollment durability, bounded history and background task cancellation. */
export default class OpsMonitor extends TypertRemoteService {
  static inject = ['remoteOps', 'storageDomain', 'tools', 'approval']
  static Config = z.object({
    intervalMs: z.number().min(10000).max(3600000).default(60000),
    timeoutMs: z.number().min(1000).max(120000).default(15000),
    maxServers: z.number().min(1).max(100).default(20),
    historyPoints: z.number().min(2).max(1440).default(120),
    streamIntervalMs: z.number().min(1000).max(60000).default(5000),
  })
  private readonly ready: Promise<Domain<typeof monitorDomain>>
  private readonly controller = new AbortController()
  private chain: Promise<void> = Promise.resolve()
  private storageFailed = false
  constructor(ctx: Context, private readonly config: Config) {
    super(ctx, 'opsMonitor')
    this.ready = ctx.storageDomain.open(monitorDomain)
    ctx.effect(async () => {
      const domain = await this.ready
      const run = this.drive()
      return async () => {
        this.controller.abort()
        await run
        await this.chain
        await domain.close()
      }
    })
    registerTools(ctx, this)
  }
  private async mutate<T>(operation: (domain: Domain<typeof monitorDomain>) => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      if (this.controller.signal.aborted) throw new MonitorError('closed')
      if (this.storageFailed) throw new MonitorError('storage')
      return operation(await this.ready)
    })
    this.chain = result.then(() => {}, (_reported: unknown) => { /* The caller receives this operation's failure. */ })
    return result
  }
  private async persist(domain: Domain<typeof monitorDomain>, monitor: Monitor): Promise<void> {
    try {
      await domain.table('monitors').put(monitor.serverId, monitor)
    } catch (error) {
      this.storageFailed = true
      this.ctx.logger.error('Monitoring storage failed; collection stopped. Inspect the storage provider before restarting.', error)
      throw new MonitorError('storage')
    }
  }
  /**
   * Enable fixed collectors on a saved, fingerprint-pinned server. A direct UI call is the user's enrollment action.
   * @param serverId - existing saved SSH connection.
   * @param selected - reviewed templates authorized for repeated collection.
   * @param expectedTarget - connection identity reviewed by the caller before authorization.
   * @returns enrollment after durable commit; no collection runs before that commit.
   */
  @Remote
  async enable(serverId: ServerId, selected: TemplateId[], expectedTarget: string): Promise<Monitor> {
    const input = enrollment.parse({ serverId, templates: selected })
    return this.mutate(async (domain) => {
      const server = await this.ctx.remoteOps.repository.get(input.serverId)
      if (targetOf(server) !== expectedTarget) throw new MonitorError('targetChanged')
      const table = domain.table('monitors')
      if (!table.get(input.serverId) && table.size >= this.config.maxServers) throw new MonitorError('capacity')
      const record: Monitor = {
        serverId: input.serverId, name: server.name, target: targetOf(server),
        templates: input.templates, enabled: true, samples: [],
      }
      await this.persist(domain, record)
      return record
    })
  }
  /**
   * Stop future collection and retain history. An in-flight read may finish but cannot append after disable commits.
   * @param serverId - enrolled server.
   */
  @Remote
  async disable(serverId: ServerId): Promise<void> {
    enrollment.shape.serverId.parse(serverId)
    await this.mutate(async (domain) => {
      const monitor = domain.table('monitors').get(serverId)
      if (!monitor) throw new MonitorError('missing')
      await this.persist(domain, { ...monitor, enabled: false })
    })
  }
  /**
   * Read saved metadata and bounded metrics, never SSH secrets or raw command output.
   * @returns current dashboard with timestamps and explicit failed attempts.
   */
  @Remote
  async snapshot(): Promise<Dashboard> {
    const domain = await this.ready
    return {
      now: Date.now(), intervalMs: this.config.intervalMs, failure: this.storageFailed ? 'storage' : null,
      monitors: [...domain.table('monitors').entries()].map(([, value]) => value),
      servers: (await this.ctx.remoteOps.list()).map(server => ({
        id: server.id, name: server.name, host: server.host, group: server.group, target: targetOf(server),
      })),
      templates,
    }
  }
  /**
   * Stream dashboard snapshots while a browser holds the resource.
   * @param signal - subscriber lifetime.
   * @returns current state and subsequent refreshes; collection has its own lifetime.
   */
  @Remote({ mode: 'stream' })
  async *follow(signal: AbortSignal): AsyncIterable<Dashboard> {
    const combined = AbortSignal.any([signal, this.controller.signal])
    while (!combined.aborted) {
      yield await this.snapshot()
      try {
        await delay(this.config.streamIntervalMs, undefined, { signal: combined })
      } catch (error) {
        if (!isAborted(combined)) throw error
      }
    }
  }
  private async collect(monitor: Monitor): Promise<Sample> {
    const signal = AbortSignal.any([this.controller.signal, AbortSignal.timeout(this.config.timeoutMs)])
    try {
      const server = await this.ctx.remoteOps.repository.get(monitor.serverId)
      if (targetOf(server) !== monitor.target) return { at: Date.now(), status: 'targetChanged', metrics: [] }
      const metrics: Sample['metrics'] = []
      const failures: NonNullable<Sample['failures']> = []
      for (const id of [...monitor.templates].sort((a, b) => templateMap[a].priority - templateMap[b].priority)) {
        if (signal.aborted) { failures.push({ templateId: id, status: 'command' }); continue }
        const template = templateMap[id]
        try {
          const result = await this.ctx.remoteOps.connections.execute(server, template.script, signal)
          if (result.interrupted || result.truncated || result.exitCode !== 0) {
            failures.push({ templateId: id, status: 'command' })
            continue
          }
          try {
            metrics.push(...parseMetrics(id, result.output))
          } catch (_invalidOutput: unknown) {
            failures.push({ templateId: id, status: 'parse' })
          }
        } catch (_transportFailure: unknown) {
          failures.push({ templateId: id, status: 'connection' })
        }
      }
      const status = failures.length ? metrics.length ? 'partial' : failures[0]?.status ?? 'command' : 'ok'
      return withNetworkRates(monitor.samples.at(-1), { at: Date.now(), status, metrics, failures })
    } catch (_transportFailure: unknown) {
      return { at: Date.now(), status: 'connection', metrics: [] }
    }
  }
  private async drive(): Promise<void> {
    try {
      const domain = await this.ready
      while (!this.controller.signal.aborted && !this.storageFailed) {
        const started = Date.now()
        for (const [, monitor] of domain.table('monitors').entries()) {
          if (!monitor.enabled || isAborted(this.controller.signal)) continue
          const sample = await this.collect(monitor)
          if (isAborted(this.controller.signal)) break
          await this.mutate(async (current) => {
            if (current.table('monitors').get(monitor.serverId) !== monitor) return
            await this.persist(current, { ...monitor, samples: [...monitor.samples, sample].slice(-this.config.historyPoints) })
          })
        }
        await delay(Math.max(1, this.config.intervalMs - (Date.now() - started)), undefined, { signal: this.controller.signal })
      }
    } catch (error) {
      if (this.controller.signal.aborted) return
      this.storageFailed = true
      this.ctx.logger.error('Monitoring stopped; inspect storage and restart the plugin.', error)
    }
  }
}
function targetOf(server: { host: string; port: number; username: string; auth: string; fingerprint: string }): string {
  return JSON.stringify([server.host, server.port, server.username, server.auth, server.fingerprint])
}

function isAborted(signal: AbortSignal): boolean { return signal.aborted }
