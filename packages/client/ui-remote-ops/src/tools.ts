/** SSH model tools reuse the current agent, tool transcript and approval service. */
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-tools'
import type {} from '@deepseek-ai/dsh-user-approval'
import { z } from 'zod'
import type RemoteOps from './index.ts'
/**
 * Register metadata-only discovery and explicitly approved remote command execution.
 * @param ctx - Host context with tools and approval.
 * @param service - local SSH owner.
 */
export function registerTools(ctx: Context, service: RemoteOps): void {
  ctx.effect(() =>
    ctx.tools.register({
      name: 'ssh_servers',
      description:
        'List locally configured SSH servers and their ids. No passwords or private keys are returned. Configure servers in the Remote operations workspace.',
      parameters: { type: 'object', properties: {}, additionalProperties: false },
      output: {
        schema: {
          type: 'object',
          properties: { servers: { type: 'array', items: { type: 'object' } } },
          required: ['servers'],
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute() {
        return { servers: await service.repository.list() }
      },
      presentCall: args => ({ card: 'generic', title: 'ssh_servers', rawInput: args }),
    }),
  )
  ctx.effect(() =>
    ctx.tools.register({
      name: 'ssh_execute',
      description:
        'Execute a shell command on a saved, fingerprint-pinned SSH server. Always requests existing session approval before connecting. Uses an independent channel, never the user interactive terminal. An interrupted result means remote effects may have happened; do not automatically retry mutations. No credential arguments are accepted.',
      parameters: {
        type: 'object',
        properties: { server_id: { type: 'string' }, command: { type: 'string' } },
        required: ['server_id', 'command'],
        additionalProperties: false,
      },
      output: {
        schema: {
          type: 'object',
          properties: {
            output: { type: 'string' },
            exitCode: { oneOf: [{ type: 'number' }, { type: 'null' }] },
            interrupted: { type: 'boolean' },
            truncated: { type: 'boolean' },
          },
          required: ['output', 'exitCode', 'interrupted', 'truncated'],
          additionalProperties: false,
        },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      },
      async execute(raw, exec) {
        const args = z
          .object({ server_id: z.uuid(), command: z.string().trim().min(1).max(32768) })
          .strict()
          .parse(raw)
        if (!exec.agent) throw new Error('SSH execution requires an agent session')
        const server = await service.repository.get(args.server_id)
        const outcome = await ctx.approval.request({
          agent: exec.agent,
          toolName: 'ssh_execute',
          callId: exec.callId,
          signal: exec.signal,
          reason: `${server.name} (${server.username}@${server.host}:${server.port})\n${args.command}`,
        })
        if (outcome !== 'allowed-once') throw new Error('SSH execution was not approved; no connection was opened')
        exec.signal.throwIfAborted()
        return service.connections.execute(server, args.command, exec.signal)
      },
      presentCall: args => ({ card: 'generic', title: 'ssh_execute', rawInput: args }),
    }),
  )
}
