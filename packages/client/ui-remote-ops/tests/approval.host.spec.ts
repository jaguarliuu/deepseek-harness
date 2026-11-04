/** Existing approval audit must settle before an SSH connection can be opened. */
import { Context } from '@deepseek-ai/cordis'
import SessionStore from '@deepseek-ai/dsh-session'
import SessionProjections from '@deepseek-ai/dsh-session-projection'
import ApprovalService, { type ApprovalOutcome } from '@deepseek-ai/dsh-user-approval'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import Tools, { type ToolRunContext } from '@deepseek-ai/dsh-tools'
import type { Agent } from '@deepseek-ai/dsh-agent'
import { ToolCallId } from '@deepseek-ai/dsh-llm'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished, vi } from 'vitest'
import RemoteOps from '../src/index.ts'
async function fixture(outcome: ApprovalOutcome) {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoc-ssh-approval-'))
  const ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  await ctx.plugin(SessionStore)
  await ctx.plugin(SessionProjections)
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(Tools)
  await ctx.plugin(ApprovalService, { policy: 'ask' })
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, 'credentials.yaml'), watch: false })
  await ctx.plugin(RemoteOps, {
    connectTimeoutMs: 1000,
    commandTimeoutMs: 1000,
    outputCharacters: 1024,
    maxTerminals: 1,
  })
  const entry = await ctx.remoteOps.repository.save({
    name: 'Internal SSH',
    group: 'test',
    host: '127.0.0.1',
    port: 22,
    username: 'employee',
    auth: 'password',
    secret: 'never-send-this',
    passphrase: '',
    fingerprint: `SHA256:${'A'.repeat(43)}`,
  })
  const execute = vi
    .spyOn(ctx.remoteOps.connections, 'execute')
    .mockResolvedValue({ output: 'inspection complete', exitCode: 0, interrupted: false, truncated: false })
  ctx.on('approval/request', () => Promise.resolve(outcome))
  const session = ctx.sessions.create()
  session.append('turn/start', { turn: 1 })
  const agent = { session } as Agent
  const tool = ctx.tools.get('ssh_execute')!
  const args = { server_id: entry.id, command: 'uptime' }
  const input = {
    agent,
    signal: new AbortController().signal,
    name: 'ssh_execute',
    callId: ToolCallId('test-ssh'),
    rootCallId: ToolCallId('test-ssh'),
    arguments: args,
  } as ToolRunContext
  return { ctx, execute, session, tool, args, input }
}
it('records a refusal and never opens an SSH connection', async () => {
  const { execute, session, tool, args, input } = await fixture('rejected')
  await expect(tool.execute(args, input)).rejects.toThrow('not approved')
  expect(execute).not.toHaveBeenCalled()
  expect(
    session
      .snapshotEvents()
      .filter(e => e.type.startsWith('approval/'))
      .map(e => e.type),
  ).toEqual(['approval/asked', 'approval/decided'])
})
it('uses the existing allowed-once decision and produces a stable model-facing result', async () => {
  const { ctx, execute, session, tool, args, input } = await fixture('allowed-once')
  expect(await tool.execute(args, input)).toMatchInlineSnapshot(`
    {
      "exitCode": 0,
      "interrupted": false,
      "output": "inspection complete",
      "truncated": false,
    }
  `)
  expect(execute).toHaveBeenCalledOnce()
  const discovery = ctx.tools.get('ssh_servers')!
  const list = await discovery.execute({}, input)
  expect(JSON.stringify(list)).not.toContain('never-send-this')
  expect(
    session
      .snapshotEvents()
      .filter(e => e.type.startsWith('approval/'))
      .map(e => ({ type: e.type, ...(e.type === 'approval/decided' ? { outcome: e.data.outcome } : {}) })),
  ).toEqual([{ type: 'approval/asked' }, { type: 'approval/decided', outcome: 'allowed-once' }])
})
