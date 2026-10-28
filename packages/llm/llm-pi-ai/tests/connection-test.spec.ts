import { createServer } from 'node:http'
import { afterEach, expect, it, vi } from 'vitest'
import { testConnection } from '../src/connection-test.ts'
import { PiAiAdapter } from '../src/adapter.ts'
import { resolveProfiles } from '../src/config.ts'
import { memoryAuth } from './auth-double.ts'
import { closeMockServers, mockServer, textEvents } from './mock-server.ts'

afterEach(closeMockServers)

it('sends the selected model and credential without saving either', async () => {
  const server = createServer((req, res) => {
    void (async () => {
      expect(req.url).toBe('/v1/chat/completions')
      expect(req.headers.authorization).toBe('Bearer draft-key')
      let body = ''
      for await (const chunk of req) body += String(chunk)
      expect(JSON.parse(body)).toMatchObject({ model: 'private-model', stream: false })
      res.end(JSON.stringify({ choices: [{ message: { content: 'OK' } }] }))
    })().catch((error: unknown) => { res.destroy(error instanceof Error ? error : new Error(String(error))) })
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('No listener')
  try {
    await testConnection({ baseURL: `http://127.0.0.1:${address.port}/v1`, api: 'openai-completions', model: 'private-model' }, AbortSignal.timeout(3000), 'draft-key')
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() =>{  resolve() })) }
})

it.each([401, 403, 404, 500])('reports HTTP %i without leaking the server response', async (status) => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('secret draft-key', { status }))
  try {
    await expect(testConnection({ baseURL: 'http://localhost/v1', api: 'openai-completions', model: 'm' }, AbortSignal.timeout(3000), 'draft-key')).rejects.toThrow(`HTTP ${status}`)
  } finally { spy.mockRestore() }
})

it('does not treat a successful model listing or HTML page as successful inference', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"data":[{"id":"m"}]}'))
  try {
    await expect(testConnection({ baseURL: 'http://localhost/v1', api: 'openai-completions', model: 'm' }, AbortSignal.timeout(3000))).rejects.toThrow('Invalid inference response')
  } finally { spy.mockRestore() }
})

it('supports a saved no-key provider through the real streaming SDK without sending authentication', async () => {
  const server = await mockServer([{ events: textEvents }])
  const resolveApiKey = vi.fn(() => Promise.resolve('must-not-use'))
  const adapter = new PiAiAdapter({
    profiles: () => resolveProfiles({ private: { noAuth: true, apiKeyEnv: 'IGNORED_KEY', api: 'openai-completions', baseURL: server.url, models: [{ id: 'm' }] } }),
    resolveApiKey,
    auth: memoryAuth(),
  })
  const chunks = []
  for await (const chunk of adapter.stream({ provider: 'private', model: 'm', messages: [] })) chunks.push(chunk)
  expect(resolveApiKey).not.toHaveBeenCalled()
  expect(server.headers).toHaveLength(1)
  expect(server.headers[0]?.authorization).toBeUndefined()
  expect(server.headers[0]?.['x-api-key']).toBeUndefined()
  expect(chunks.at(-1)).toMatchObject({ type: 'finish', reason: { kind: 'stop' } })
})

it('omits a supplied key when testing explicit no-auth mode', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{"choices":[{"message":{"content":"OK"}}]}'))
  try {
    await testConnection({ baseURL: 'http://localhost/v1', api: 'openai-completions', model: 'm', noAuth: true }, AbortSignal.timeout(3000), 'ignored-key')
    expect(new Headers(spy.mock.calls[0]?.[1]?.headers).has('authorization')).toBe(false)
    expect(spy.mock.calls[0]?.[1]?.redirect).toBe('error')
  } finally { spy.mockRestore() }
})

it('settles on cancellation instead of leaving a test pending', async () => {
  const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
    await new Promise<void>((_resolve, reject) => init?.signal?.addEventListener('abort', () =>{  reject(new Error('aborted')) }, { once: true }))
    throw new Error('unreachable')
  })
  try {
    await expect(testConnection({ baseURL: 'http://localhost/v1', api: 'openai-completions', model: 'm' }, AbortSignal.timeout(20))).rejects.toThrow('timed out or was cancelled')
  } finally { spy.mockRestore() }
})
