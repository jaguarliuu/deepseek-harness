/** Durable enrollments, approval and cancellation with actual storage and only SSH responses mocked. */
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import ApprovalService from '@deepseek-ai/dsh-user-approval'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import RemoteOps from '@deepseek-ai/dsh-client-ui-remote-ops'
import Storage from '@deepseek-ai/dsh-storage'
import * as JsonStorage from '@deepseek-ai/dsh-storage-json'
import * as Domains from '@deepseek-ai/dsh-storage-domain'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import OpsMonitor from '../src/index.ts'
const config = { intervalMs: 60000, timeoutMs: 1000, streamIntervalMs: 1000, maxServers: 2, historyPoints: 2 }
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'ops-monitor-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(dir, { recursive: true, force: true }) })
  await ctx.plugin(SessionStore); await ctx.plugin(SessionProjections); await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools); await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(Storage); await ctx.plugin(JsonStorage, { root: join(dir, 'storage') }); await ctx.plugin(Domains, { backend: 'json' })
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, 'credentials.yaml'), watch: false })
  await ctx.plugin(RemoteOps, { connectTimeoutMs: 1000, commandTimeoutMs: 1000, outputCharacters: 4096, maxTerminals: 1 })
  const server = await ctx.remoteOps.repository.save({ name: 'Monitoring test', group: '', host: '127.0.0.1', port: 22,
    username: 'monitor', auth: 'password', secret: 'secret-not-for-model', passphrase: '', fingerprint: `SHA256:${'A'.repeat(43)}` })
  const execute = vi.spyOn(ctx.remoteOps.connections, 'execute').mockResolvedValue({ output: 'disk_percent\t72\t%\t/\n', exitCode: 0, interrupted: false, truncated: false })
  const fiber = await ctx.plugin(OpsMonitor, config)
  const session = ctx.sessions.create(); session.append('turn/start', { turn: 1 })
  const agent = { session } as Agent
  const input = { agent, signal: new AbortController().signal, name: 'monitoring_enable', callId: ToolCallId('monitor-enable'),
    rootCallId: ToolCallId('monitor-enable'), arguments: {} } as ToolRunContext
  const target = (await ctx.opsMonitor.snapshot()).servers[0]!.target
  return { ctx, execute, fiber, session, input, id: server.id, target }
}
it('refuses unapproved repeated collection and keeps credentials out of discovery', async () => {
  const f = await fixture()
  f.ctx.on('approval/request', async () => 'rejected')
  await expect(f.ctx.tools.get('monitoring_enable')!.execute({ serverId: f.id, templates: ['linux-filesystems'] }, f.input)).rejects.toThrow('not approved')
  expect((await f.ctx.opsMonitor.snapshot()).monitors).toEqual([])
  expect(f.execute).not.toHaveBeenCalled()
  const catalog = await f.ctx.tools.get('monitoring_catalog')!.execute({}, f.input)
  expect(JSON.stringify(catalog)).not.toContain('secret-not-for-model')
  expect(f.session.snapshotEvents().filter(e => e.type.startsWith('approval/')).map(e => e.type)).toEqual(['approval/asked', 'approval/decided'])
})
it('restores enrollments, records a sample and unregisters tools on disposal', async () => {
  const f = await fixture()
  f.ctx.on('approval/request', async () => 'allowed-once')
  await f.ctx.tools.get('monitoring_enable')!.execute({ serverId: f.id, templates: ['linux-filesystems'] }, f.input)
  await f.fiber.dispose()
  expect(f.ctx.tools.get('monitoring_query')).toBeUndefined()
  const restored = await f.ctx.plugin(OpsMonitor, config)
  await expect.poll(async () => (await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples.length).toBe(1)
  const query = await f.ctx.tools.get('monitoring_query')!.execute({ serverId: f.id, points: 1 }, f.input)
  expect(query).toMatchObject({ serverId: f.id, enabled: true, samples: [{ status: 'ok', metrics: [{ name: 'disk_percent', value: 72, unit: '%', label: '/' }] }] })
  await f.ctx.opsMonitor.disable(f.id)
  await restored.dispose()
  await f.ctx.plugin(OpsMonitor, config)
  expect((await f.ctx.opsMonitor.snapshot()).monitors[0]?.enabled).toBe(false)
  expect(f.execute).toHaveBeenCalledOnce()
})
it('keeps a malformed sample as a failure, never as a zero', async () => {
  const f = await fixture()
  await f.ctx.opsMonitor.enable(f.id, ['linux-filesystems'], f.target)
  f.execute.mockResolvedValue({ output: 'disk_percent\tNaN\t%\t/\n', exitCode: 0, interrupted: false, truncated: false })
  await f.fiber.dispose(); await f.ctx.plugin(OpsMonitor, config)
  await expect.poll(async () => (await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.status).toBe('parse')
  expect((await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.metrics).toEqual([])
})
it('rejects a changed target before writing an enrollment', async () => {
  const f = await fixture()
  await expect(f.ctx.opsMonitor.enable(f.id, ['linux-health'], 'old-target')).rejects.toMatchObject({ code: 'targetChanged' })
  expect((await f.ctx.opsMonitor.snapshot()).monitors).toEqual([])
})
it('aborts and joins an in-flight collector when unloaded', async () => {
  const f = await fixture()
  await f.ctx.opsMonitor.enable(f.id, ['linux-filesystems'], f.target)
  await f.fiber.dispose()
  let aborted = false
  f.execute.mockImplementation((_server, _command, signal) => new Promise((resolve) => {
    signal!.addEventListener('abort', () => { aborted = true; resolve({ output: '', exitCode: null, interrupted: true, truncated: false }) }, { once: true })
  }))
  const running = await f.ctx.plugin(OpsMonitor, config)
  await expect.poll(() => f.execute.mock.calls.length).toBe(1)
  await running.dispose()
  expect(aborted).toBe(true)
})
it.each([
  { output: 'disk_percent\t72\t%\t/\n', exitCode: 1, interrupted: false, truncated: false },
  { output: 'disk_percent\t72\t%\t/\n', exitCode: 0, interrupted: true, truncated: false },
  { output: 'disk_percent\t72\t%\t/\n', exitCode: 0, interrupted: false, truncated: true },
])('rejects unsuccessful or incomplete command output even when numeric rows look valid', async (result) => {
  const f = await fixture()
  await f.ctx.opsMonitor.enable(f.id, ['linux-filesystems'], f.target)
  f.execute.mockResolvedValue(result)
  await f.fiber.dispose(); await f.ctx.plugin(OpsMonitor, config)
  await expect.poll(async () => (await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.status).toBe('command')
  expect((await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.metrics).toEqual([])
})
it('retains only the configured history window across restarts', async () => {
  const f = await fixture()
  await f.ctx.opsMonitor.enable(f.id, ['linux-filesystems'], f.target)
  await f.fiber.dispose()
  for (let attempt = 1; attempt <= 3; attempt++) {
    const fiber = await f.ctx.plugin(OpsMonitor, config)
    await expect.poll(() => f.execute.mock.calls.length).toBe(attempt)
    await expect.poll(async () => (await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples.length).toBe(Math.min(attempt, 2))
    await fiber.dispose()
  }
})
it('isolates a failed template and preserves other metrics in queries and restored history', async () => {
  const f = await fixture()
  await f.ctx.opsMonitor.enable(f.id, ['linux-filesystems', 'linux-health'], f.target)
  f.execute.mockImplementation(async (_server, script) => ({
    output: script.includes('df -Pk') ? 'disk_percent\t72\t%\t/\n' : 'invalid health output',
    exitCode: 0, interrupted: false, truncated: false,
  }))
  await f.fiber.dispose()
  const running = await f.ctx.plugin(OpsMonitor, config)
  await expect.poll(async () => (await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.status).toBe('partial')
  const result = await f.ctx.tools.get('monitoring_query')!.execute({ serverId: f.id, points: 1 }, f.input)
  expect(result).toMatchObject({ samples: [{ status: 'partial', failures: [{ templateId: 'linux-health', status: 'parse' }],
    metrics: [{ name: 'disk_percent', value: 72 }] }] })
  expect(f.execute.mock.calls[0]?.[1]).toContain('/proc/stat')
  await f.ctx.opsMonitor.disable(f.id)
  await running.dispose()
  await f.ctx.plugin(OpsMonitor, config)
  expect((await f.ctx.opsMonitor.snapshot()).monitors[0]?.samples[0]?.status).toBe('partial')
})
