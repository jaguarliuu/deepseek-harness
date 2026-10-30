/** Saved edits are revision-fenced and failures retain the prior configuration. */
import { expect, it, vi } from 'vitest'
import { McpSettingsModel } from '../src/client/model.ts'
import type { McpServer } from '../src/types.ts'

const server: McpServer = { name: 'local', enabled: false, transport: 'stdio', command: 'node', args: [], env: {}, cwd: '', headers: {}, url: '', timeoutMs: 1000 }
it('passes the opening revision to the persistence owner', async () => {
  const mutate = vi.fn().mockResolvedValue(true)
  const model = new McpSettingsModel({ getSnapshot: () => ({ status: 'ready', value: { servers: [] }, base: {}, user: {}, writable: true, revision: 3 }),
    subscribe: () => () => {}, mutate })
  expect(await model.save([server], 2)).toBe(true)
  expect(mutate).toHaveBeenCalledWith([{ op: 'set', path: ['servers'], value: [server] }], 2)
  expect(model.activity.getSnapshot().result).toBe('saved')
})
it('contains save failures and reports refusal without claiming success', async () => {
  const model = new McpSettingsModel({ getSnapshot: () => ({ status: 'ready', value: { servers: [] }, base: {}, user: {}, writable: true, revision: 3 }),
    subscribe: () => () => {}, mutate: async () => { throw new Error('disk full') } })
  expect(await model.save([server], 3)).toBe(false)
  expect(model.activity.getSnapshot()).toEqual({ saving: false, result: 'saveFailed' })
})
