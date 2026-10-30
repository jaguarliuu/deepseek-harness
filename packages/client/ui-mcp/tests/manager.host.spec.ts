/** Real MCP handshakes, tool activation and unload without model credentials. */
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { Context } from '@deepseek-ai/cordis'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { expect, it, onTestFinished } from 'vitest'
import McpManager from '../src/index.ts'
import type { McpServer } from '../src/types.ts'
import { startHttpMcpFixture } from './http-fixture.ts'

async function fixture() {
  const http = await startHttpMcpFixture()
  const ctx = new Context()
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  onTestFinished(async () => { await ctx.fiber.dispose(); await http.close() })
  const server: McpServer = { name: 'internal', enabled: true, transport: 'streamable-http', url: http.url,
    headers: { Authorization: 'Bearer local-test' }, command: '', args: [], env: {}, cwd: '', timeoutMs: 1000 }
  return { http, ctx, server }
}
it('probes tools without invoking or registering them and forwards authentication', async () => {
  const { http, ctx, server } = await fixture()
  await ctx.plugin(McpManager, { servers: [] })
  expect(await ctx.mcpManager.test(server)).toEqual({ ok: true, tools: ['ping'] })
  expect(http.calls).toEqual([])
  expect(http.authorization).toContain('Bearer local-test')
  expect(ctx.tools.definitions().some(tool => tool.name.startsWith('mcp__internal__'))).toBe(false)
})
it('registers enabled service tools and removes them on unload', async () => {
  const { ctx, server } = await fixture()
  const fiber = ctx.plugin(McpManager, { servers: [server] })
  await fiber
  await expect.poll(() => ctx.tools.definitions().some(tool => tool.name === 'mcp__internal__ping')).toBe(true)
  await fiber.dispose()
  expect(ctx.tools.definitions().some(tool => tool.name === 'mcp__internal__ping')).toBe(false)
  await ctx.plugin(McpManager, { servers: [{ ...server, enabled: false }] })
  expect(ctx.tools.definitions().some(tool => tool.name === 'mcp__internal__ping')).toBe(false)
})
it('contains unreachable endpoints and rejects malformed configuration', async () => {
  const { ctx, server } = await fixture()
  await ctx.plugin(McpManager, { servers: [] })
  expect(await ctx.mcpManager.test({ ...server, url: 'http://127.0.0.1:1/mcp' })).toEqual({ ok: false, code: 'connection' })
  expect(await ctx.mcpManager.test({ ...server, url: 'file:///tmp/mcp' })).toEqual({ ok: false, code: 'invalid' })
})

it('loads an empty configuration without blocking application startup', () => {
  expect(McpManager.Config({ servers: [] }).servers.get()).toEqual([])
  expect(McpManager.Config({}).servers.get()).toEqual([])
})
it('discovers a local stdio program and closes it after testing', async () => {
  const { ctx, server } = await fixture()
  await ctx.plugin(McpManager, { servers: [] })
  const result = await ctx.mcpManager.test({ ...server, transport: 'stdio', command: process.execPath,
    args: [fileURLToPath(new URL('./fixtures/server.mjs', import.meta.url))] })
  expect(result).toEqual({ ok: true, tools: ['local_ping'] })
})
it('bounds a handshake that never responds', async () => {
  const { ctx, server } = await fixture()
  const http = createServer(() => {})
  await new Promise<void>((resolve) => { http.listen(0, '127.0.0.1', resolve) })
  onTestFinished(() => { http.closeAllConnections(); http.close() })
  const address = http.address()
  if (address === null || typeof address === 'string') throw new Error('Missing listener')
  await ctx.plugin(McpManager, { servers: [] })
  expect(await ctx.mcpManager.test({ ...server, url: `http://127.0.0.1:${address.port}/mcp` }))
    .toEqual({ ok: false, code: 'timeout' })
}, 5000)
