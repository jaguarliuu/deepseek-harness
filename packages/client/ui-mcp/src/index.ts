/** Persistently configured MCP connections and isolated handshake probes. */
import type { Fiber } from '@deepseek-ai/cordis'
import type { Volatile } from '@deepseek-ai/cosmokit'
import type {} from '@deepseek-ai/cordis-plugin-loader'
import type { Context } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import * as mcp from '@deepseek-ai/dsh-mcp-client'
import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client'
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio'
import { scrubbedParentEnv } from '@deepseek-ai/dsh-subprocess'
import { serverSchema, serversSchema } from './config.ts'

declare module '@deepseek-ai/cordis' {
  interface Context { mcpManager: McpManager }
}

import type { ProbeResult, McpServer, McpSettings } from './types.ts'

/** Live configuration references supplied by the Loader. */
export interface Config {
  /** Named service definitions; changes replace affected connections. */
  servers: Volatile<McpSettings['servers']>
}

/** Own configured MCP children; each uses the standard reconnect and tool registration lifecycle. */
export default class McpManager extends TypertRemoteService {
  static inject = ['tools']
  static Config = z.object({
    servers: z.array(z.object({
      name: z.string().pattern(/^[A-Za-z0-9_-]{1,32}$/u).required(), enabled: z.boolean().required(),
      transport: z.union([z.const('streamable-http'), z.const('stdio')]).required(),
      url: z.string().default(''), headers: z.dict(z.string()).default({}), command: z.string().default(''),
      args: z.array(z.string()).default([]), env: z.dict(z.string()).default({}), cwd: z.string().default(''),
      timeoutMs: z.number().step(1).min(1000).max(300000).default(15000),
    })).default([]).volatile(),
  })

  private readonly lifetime = new AbortController()
  private readonly probes = new Set<Promise<ProbeResult>>()

  constructor(ctx: Context, config: Config) {
    super(ctx, 'mcpManager')
    serversSchema.parse(config.servers.get())
    const children = new Map<string, { definition: string; fiber: Fiber }>()
    const shuttingDown = (): boolean => this.lifetime.signal.aborted
    let failed = false
    let tail = Promise.resolve()
    const reconcile = async (): Promise<void> => {
      if (shuttingDown() || failed) return
      const servers = serversSchema.parse(config.servers.get()).filter(item => item.enabled)
      for (const [name, child] of children) {
        if (servers.some(server => server.name === name && JSON.stringify(server) === child.definition)) continue
        await child.fiber.dispose()
        children.delete(name)
      }
      for (const server of servers) {
        if (shuttingDown() || children.has(server.name)) continue
        const fiber = ctx.plugin(mcp, server.transport === 'stdio'
          ? { serverName: server.name, transport: server.transport, command: server.command, args: server.args,
            env: server.env, cwd: server.cwd, toolCallTimeoutMs: server.timeoutMs, failOnStartupError: false }
          : { serverName: server.name, transport: server.transport, url: server.url,
            headers: server.headers, toolCallTimeoutMs: server.timeoutMs, failOnStartupError: false })
        children.set(server.name, { definition: JSON.stringify(server), fiber })
      }
    }
    const update = (): void => {
      tail = tail.then(reconcile).catch(() => {
        failed = true
        ctx.logger.error('MCP services could not apply configuration; restart the application before changing connections again')
      })
    }
    update()
    ctx.on('loader/volatile-update', update)
    ctx.effect(() => async () => {
      this.lifetime.abort()
      await tail
      await Promise.allSettled(this.probes)
    })
  }

  /**
   * Initialize a temporary connection and enumerate tools without calling them or changing saved settings.
   * @param server - unsaved definition to verify; stdio starts the specified local executable.
   * @returns tool names on success, or a redacted failure after connection cleanup.
   */
  @Remote
  async test(server: McpServer): Promise<ProbeResult> {
    if (!serverSchema.safeParse(server).success) return { ok: false, code: 'invalid' }
    this.lifetime.signal.throwIfAborted()
    const probe = this.probe(server)
    this.probes.add(probe)
    try { return await probe } finally { this.probes.delete(probe) }
  }

  private async probe(server: McpServer): Promise<ProbeResult> {
    const signal = AbortSignal.any([this.lifetime.signal, AbortSignal.timeout(server.timeoutMs)])
    const client = new Client({ name: 'zhiwei-mcp-probe', version: '1.0.0' }, { capabilities: {}, versionNegotiation: { mode: 'auto' } })
    const transport = server.transport === 'stdio'
      ? new StdioClientTransport({ command: server.command, args: server.args, ...(server.cwd ? { cwd: server.cwd } : {}),
        env: { ...scrubbedParentEnv(), ...server.env }, stderr: 'pipe' })
      : new StreamableHTTPClientTransport(new URL(server.url), { requestInit: { headers: server.headers, redirect: 'error' },
        fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.any([signal, ...(init?.signal ? [init.signal] : [])]) }) })
    const abort = (): void => { void client.close().catch(() => undefined) }
    signal.addEventListener('abort', abort, { once: true })
    let result: ProbeResult
    try {
      signal.throwIfAborted()
      await client.connect(transport)
      signal.throwIfAborted()
      const tools = await client.listTools({}, { signal, timeout: server.timeoutMs })
      result = { ok: true, tools: tools.tools.map(tool => tool.name) }
    } catch (_connectionFailure) {
      result = { ok: false, code: signal.aborted ? 'timeout' : 'connection' }
    } finally {
      signal.removeEventListener('abort', abort)
    }
    try { await client.close(); await transport.close() } catch (_cleanupFailure) { return { ok: false, code: 'cleanup' } }
    return result
  }
}
