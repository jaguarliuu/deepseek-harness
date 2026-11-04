/** Real SSH protocol checks against a private loopback fixture; no company servers are contacted. */
import { generateKeyPairSync } from 'node:crypto'
import { Server, utils, type Connection } from 'ssh2'
import { expect, it, onTestFinished } from 'vitest'
import { Connections, hostFingerprint } from '../src/connections.ts'
import type { StoredServer } from '../src/repository.ts'

async function fixture() {
  const key = generateKeyPairSync('rsa', { modulusLength: 2048 })
    .privateKey.export({ type: 'pkcs1', format: 'pem' })
    .toString()
  const parsed = utils.parseKey(key)
  if (parsed instanceof Error || Array.isArray(parsed)) throw new Error('fixture key invalid')
  const fingerprint = hostFingerprint(parsed.getPublicSSH())
  const clients = new Set<Connection>()
  const state = { authenticated: 0, commands: [] as string[] }
  const server = new Server({ hostKeys: [key] }, (client) => {
    clients.add(client)
    client.on('error', (_error: Error) => {
      /* Rejected fingerprint tests intentionally close the handshake. */
    })
    client.on('close', () => clients.delete(client))
    client.on('authentication', (ctx) => {
      if (ctx.method === 'password' && ctx.password === 'local-test-password') {
        state.authenticated++
        ctx.accept()
      } else ctx.reject()
    })
    client.on('ready', () =>
      client.on('session', (accept) => {
        const session = accept()
        session.on('pty', (acceptPty) => {
          acceptPty()
        })
        session.on('window-change', (acceptWindow) => {
          acceptWindow?.()
        })
        session.on('shell', (acceptShell) => {
          const stream = acceptShell()
          stream.write('小 C SSH ready\r\n')
          stream.on('data', (bytes: Buffer) => stream.write(bytes))
        })
        session.on('exec', (acceptExec, _reject, info) => {
          state.commands.push(info.command)
          const stream = acceptExec()
          if (info.command === 'hang') return
          stream.write(info.command === 'large' ? 'x'.repeat(3000) : '巡检完成\n')
          stream.exit(0)
          stream.end()
        })
      }),
    )
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('fixture address invalid')
  const connections = new Connections({
    connectTimeoutMs: 1000,
    commandTimeoutMs: 1500,
    outputCharacters: 1024,
    maxTerminals: 2,
  })
  onTestFinished(async () => {
    await connections.close()
    for (const client of clients) client.end()
    await new Promise<void>(resolve =>
      server.close(() => {
        resolve()
      }),
    )
  })
  const entry: StoredServer = {
    id: 'd2120839-ad18-493c-9d0b-16573b9517c2',
    name: 'Local SSH',
    group: 'test',
    host: '127.0.0.1',
    port: address.port,
    username: 'employee',
    auth: 'password',
    secret: 'local-test-password',
    passphrase: '',
    fingerprint,
  }
  return { connections, entry, state }
}
it('probes a fingerprint without authenticating and refuses an untrusted host', async () => {
  const { connections, entry, state } = await fixture()
  expect(await connections.probe(entry)).toBe(entry.fingerprint)
  expect(state.authenticated).toBe(0)
  await expect(connections.test({ ...entry, fingerprint: `SHA256:${'A'.repeat(43)}` })).rejects.toThrow(
    'connectionFailed',
  )
  expect(state.authenticated).toBe(0)
  await connections.test(entry)
  expect(state.authenticated).toBe(1)
})
it('keeps an interactive shell separate from command execution and bounds output', async () => {
  const { connections, entry, state } = await fixture()
  const id = await connections.connect(entry)
  await expect.poll(() => connections.read(id, 0).data).toContain('小 C SSH ready')
  const initial = connections.read(id, 0)
  connections.write(id, 'hello\r', 90, 24)
  await expect.poll(() => connections.read(id, initial.cursor).data).toContain('hello')
  expect(await connections.execute(entry, 'uptime')).toEqual({
    output: '巡检完成\n',
    exitCode: 0,
    interrupted: false,
    truncated: false,
  })
  expect(state.commands).toEqual(['uptime'])
  expect(connections.read(id, 0).state).toBe('connected')
  const large = await connections.execute(entry, 'large')
  expect(large.truncated).toBe(true)
  expect(large.output.length).toBe(1024)
  connections.write(id, 'y'.repeat(2000), 90, 24)
  await expect.poll(() => connections.read(id, 0).truncated).toBe(true)
  await connections.disconnect(id)
  expect(() => connections.read(id, 0)).toThrow('notFound')
})
it('reports cancelled remote execution as uncertain and joins transport shutdown', async () => {
  const { connections, entry, state } = await fixture()
  const controller = new AbortController()
  const pending = connections.execute(entry, 'hang', controller.signal)
  await expect.poll(() => state.commands).toContain('hang')
  controller.abort()
  expect(await pending).toMatchObject({ exitCode: null, interrupted: true })
  await connections.close()
  await expect(connections.connect(entry)).rejects.toThrow('closed')
})
it('rejects malformed endpoints and terminal input before SSH operations', async () => {
  const { connections } = await fixture()
  await expect(connections.probe({ host: 'bad host', port: 22 })).rejects.toThrow('invalidInput')
  await expect(connections.probe({ host: 'localhost', port: -1 })).rejects.toThrow('invalidInput')
})

it('rejects malformed private keys before allocating a transport and enforces concurrent terminal limits', async () => {
  const { connections, entry } = await fixture()
  await expect(connections.test({ ...entry, auth: 'key', secret: 'invalid-private-key' })).rejects.toThrow(
    'invalidInput',
  )
  const first = connections.connect(entry)
  const second = connections.connect(entry)
  await expect(connections.connect(entry)).rejects.toThrow('limitReached')
  await connections.disconnect(await first)
  await connections.disconnect(await second)
})
