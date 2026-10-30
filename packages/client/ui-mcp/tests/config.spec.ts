/** Configuration rejects unusable endpoints and duplicate tool namespaces. */
import { expect, it } from 'vitest'
import { serverSchema, serversSchema } from '../src/config.ts'
import type { McpServer } from '../src/types.ts'

export const server: McpServer = {
  name: 'intranet', enabled: true, transport: 'streamable-http', url: 'http://localhost/mcp',
  headers: {}, command: '', args: [], env: {}, cwd: '', timeoutMs: 1000,
}
it('accepts unauthenticated HTTP and explicit authentication headers', () => {
  expect(serverSchema.parse(server)).toEqual(server)
  expect(serverSchema.parse({ ...server, headers: { Authorization: 'Bearer example' } }).headers.Authorization).toBe('Bearer example')
})
it.each([
  { name: 'invalid name' }, { url: 'file:///etc/passwd' }, { url: 'https://user:secret@example.com/mcp' },
  { timeoutMs: 0 }, { headers: { Authorization: 'Bearer a\r\nb' } }, { transport: 'stdio', command: '' },
])('rejects invalid connection fields %j', (patch) => {
  expect(serverSchema.safeParse({ ...server, ...patch }).success).toBe(false)
})
it('rejects duplicate namespaces including disabled services', () => {
  expect(serversSchema.safeParse([server, { ...server, enabled: false }]).success).toBe(false)
})
