/** Validate MCP definitions before storing or connecting. */
import { z } from 'zod'
export type { McpServer, McpSettings } from './types.ts'

/** Validate configuration before persistence or starting a network/process connection. */
export const serverSchema = z.object({
  name: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/u),
  enabled: z.boolean(), transport: z.enum(['streamable-http', 'stdio']),
  url: z.string(), headers: z.record(z.string(), z.string()), command: z.string(),
  args: z.array(z.string()), env: z.record(z.string(), z.string()), cwd: z.string(),
  timeoutMs: z.number().int().min(1000).max(300000),
}).superRefine((server, context) => {
  if (server.transport === 'stdio') {
    if (!server.command.trim()) context.addIssue({ code: 'custom', message: 'Executable is required', path: ['command'] })
    return
  }
  try {
    const url = new URL(server.url)
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash) throw new Error('Invalid endpoint')
    for (const [key, value] of Object.entries(server.headers)) {
      if (!/^[!#$%&'*+.^`|~\w-]+$/u.test(key) || /[\r\n]/u.test(value)) throw new Error('Invalid header')
    }
  } catch (_invalidEndpoint) {
    context.addIssue({ code: 'custom', message: 'Invalid HTTP endpoint or headers', path: ['url'] })
  }
})

/** Reject duplicate tool namespaces before any connection starts. */
export const serversSchema = z.array(serverSchema).superRefine((servers, context) => {
  if (new Set(servers.map(server => server.name)).size !== servers.length) {
    context.addIssue({ code: 'custom', message: 'Service names must be unique' })
  }
})
