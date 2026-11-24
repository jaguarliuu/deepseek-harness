import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import tls from 'node:tls'
import { setImmediate } from 'node:timers/promises'
import { test } from 'node:test'
import { SMTPServer } from 'smtp-server'
import { apply } from './index.js'
import { withPop3 } from './pop3.js'
import { registerPetNotification } from '../../apps/desktop/pet-packs/xiaoc-sprite/pet-notification.ts'

const EOL = '\r\n'
const bytes = [
  'From: Finance <finance@example.test>', 'Subject: Budget', 'Date: Tue, 17 Nov 2026 12:00:00 GMT',
  'Content-Type: text/plain; charset=utf-8', '', '..budget details',
].join(EOL)
const signal = new AbortController().signal

test('POP3 baseline, retry, TOP fallback, indexed reads and approved SMTP submission', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-mail-'))
  const active = new Set()
  t.after(async () => {
    await Promise.all([...active].map(close => close()))
    await rm(directory, { recursive: true, force: true })
  })
  const keyFile = join(directory, 'key.pem')
  const certFile = join(directory, 'cert.pem')
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=localhost', '-keyout', keyFile, '-out', certFile], { stdio: 'ignore' })
  const key = await readFile(keyFile)
  const cert = await readFile(certFile)
  const commands = []
  const items = new Map([[1, 'baseline']])
  let breakListing = false
  const pop = tls.createServer({ key, cert }, socket => {
    socket.write('+OK POP3 fixture' + EOL)
    socket.setEncoding('utf8')
    let buffer = ''
    socket.on('data', chunk => {
      buffer += chunk
      while (buffer.includes(EOL)) {
        const end = buffer.indexOf(EOL)
        const command = buffer.slice(0, end)
        buffer = buffer.slice(end + EOL.length)
        commands.push(command)
        const [verb, arg] = command.split(' ')
        if (verb === 'UIDL' && breakListing) {
          socket.end('+OK partial' + EOL + '1 incomplete' + EOL)
          return
        }
        switch (verb) {
          case 'USER': case 'PASS': socket.write('+OK' + EOL); break
          case 'UIDL': socket.write(['+OK', ...[...items].map(([n, id]) => `${n} ${id}`), '.', ''].join(EOL)); break
          case 'LIST': socket.write(['+OK', ...[...items.keys()].map(n => `${n} ${Buffer.byteLength(bytes)}`), '.', ''].join(EOL)); break
          case 'TOP': socket.write('-ERR TOP unavailable' + EOL); break
          case 'RETR': socket.write(items.has(Number(arg)) ? ['+OK', bytes, '.', ''].join(EOL) : '-ERR missing' + EOL); break
          case 'QUIT': socket.end('+OK bye' + EOL); break
          default: socket.write('-ERR unsupported' + EOL)
        }
      }
    })
  })
  pop.listen(0)
  await once(pop, 'listening')
  t.after(() => pop.close())

  const delivered = []
  const smtp = new SMTPServer({
    secure: true, key, cert,
    onAuth(auth, _session, callback) {
      callback(null, { user: auth.username })
    },
    onData(stream, _session, callback) {
      const chunks = []
      stream.on('data', chunk => chunks.push(chunk))
      stream.on('end', () => {
        delivered.push(Buffer.concat(chunks).toString())
        callback()
      })
    },
  })
  smtp.listen(0)
  await once(smtp.server, 'listening')
  t.after(() => smtp.close())

  const endpoint = { host: 'localhost', port: pop.address().port, username: 'person', credential: 'TEST', ca: cert.toString() }
  const config = {
    stateDirectory: join(directory, 'db'), locale: 'en', timeoutMs: 3000, pop3: endpoint, allowModelRead: true,
    smtp: { ...endpoint, port: smtp.server.address().port, security: 'tls', from: 'person@example.test' },
  }
  let decision = 'rejected'
  let canDeliver = true
  const reminders = []
  const base = {
    credentials: { resolve: async () => ({ value: 'fixture' }), readRecord: async () => undefined },
    inject() {},
    approval: { request: async () => decision },
    logger: () => ({ warn() {} }),
    bail: (_event, notification) => {
      if (!canDeliver) return
      reminders.push(Number(notification.text.match(/\d+/)[0]))
      return true
    },
  }

  async function mount() {
    const tools = new Map()
    const commands = new Map()
    const disposers = []
    await apply({
      ...base,
      tools: { register(def) { tools.set(def.name, def); return () => tools.delete(def.name) } },
      commands: { register(def) { commands.set(def.name, def); return () => commands.delete(def.name) } },
      effect: effect => {
        const cleanup = effect()
        let disposed = false
        const dispose = async () => {
          if (disposed) return
          disposed = true
          await cleanup?.()
        }
        disposers.push(dispose)
        return dispose
      },
    }, config)
    const close = async () => {
      active.delete(close)
      for (const dispose of disposers.splice(0).reverse()) await dispose()
    }
    active.add(close)
    // The test command enters the same serial POP3 queue after the initial poll.
    assert.equal((await commands.get('mail-test').handler({ signal })).kind, 'success')
    return {
      execute: (name, args) => tools.get(name).execute(args, { signal, agent: {}, callId: 'fixture' }),
      close,
    }
  }

  let runtime = await mount()
  assert.deepEqual(reminders, [])
  assert.equal((await runtime.execute('mail_search', { query: 'Budget' })).messages[0].id, 'baseline')
  await runtime.close()

  canDeliver = false
  items.set(2, 'new-mail')
  runtime = await mount()
  assert.deepEqual(reminders, [])
  await runtime.close()
  canDeliver = true
  runtime = await mount()
  assert.deepEqual(reminders, [1])
  assert.equal((await runtime.execute('mail_read', { id: 'new-mail' })).text.trim(), '.budget details')
  const outgoing = { to: 'finance@example.test', subject: 'Re: Budget', text: 'Approved.' }
  assert.equal((await runtime.execute('mail_send', outgoing)).status, 'cancelled')
  assert.deepEqual(delivered, [])
  decision = 'allowed-once'
  assert.equal((await runtime.execute('mail_send', outgoing)).status, 'accepted')
  assert.equal(delivered.length, 1)
  await runtime.close()

  runtime = await mount()
  assert.deepEqual(reminders, [1])
  await runtime.close()
  assert.ok(commands.some(command => command.startsWith('TOP ')))
  assert.ok(commands.every(command => !command.startsWith('DELE ')))
  let record
  let setupRoute
  const managedDisposers = []
  const connection = { fetch: { register(route) { setupRoute = route; return () => {} } } }
  const managed = {
    ...base,
    get: name => name === 'connection' ? connection : { home: directory },
    connection,
    inject(_services, setup) { setup(this) },
    logger: () => ({ warn() {} }),
    credentials: {
      ...base.credentials,
      readRecord: async () => record,
      modifyRecord: async (_key, mutate) => { record = await mutate(record) },
    },
    tools: { register: () => () => {} },
    commands: { register: () => () => {} },
    effect: effect => {
      const cleanup = effect()
      let disposed = false
      const dispose = async () => {
        if (disposed) return
        disposed = true
        await cleanup?.()
      }
      managedDisposers.push(dispose)
      return dispose
    },
  }
  await apply(managed)
  const disposeManaged = async () => {
    active.delete(disposeManaged)
    for (const dispose of managedDisposers.splice(0).reverse()) await dispose()
  }
  active.add(disposeManaged)
  const apiUrl = 'http://localhost' + setupRoute.path
  const readSetup = async () => (await setupRoute.fetch(new Request(apiUrl))).json()
  const submitSetup = async payload => (await setupRoute.fetch(new Request(apiUrl, {
    method: 'POST', body: JSON.stringify(payload),
  }))).json()
  assert.equal((await readSetup()).pop3, undefined)
  const draft = {
    action: 'test', revision: '', reminders: true, allowModelRead: false,
    pop3: { host: endpoint.host, port: endpoint.port, username: endpoint.username, ca: endpoint.ca, password: 'fixture' },
  }
  assert.equal((await submitSetup(draft)).code, 'tested')
  assert.equal(record, undefined)
  const saved = await submitSetup({ ...draft, action: 'save' })
  assert.equal(saved.code, 'saved')
  assert.equal(record.payload.passwords.pop3, 'fixture')
  assert.equal(saved.view.pop3.password, undefined)
  assert.equal((await readSetup()).pop3.credential, undefined)
  assert.equal((await submitSetup({ ...draft, action: 'save' })).code, 'conflict')
  assert.equal((await submitSetup({
    ...draft, revision: saved.view.revision,
    pop3: { ...draft.pop3, username: 'another', password: '' },
  })).code, 'pop3-password')
  assert.equal((await submitSetup({
    ...draft, revision: saved.view.revision, pop3: { ...draft.pop3, password: '' },
  })).code, 'tested')
  await disposeManaged()

  breakListing = true
  await assert.rejects(
    withPop3({ ...endpoint, timeoutMs: 3000, maxListingBytes: 1024 }, 'fixture', signal,
      () => assert.fail('A partial listing cannot be committed')),
    { code: 'connection' },
  )
  await setImmediate()
})

test('Small C queues a count-only bubble and wave when its surface is available', () => {
  let handler
  let ready = false
  const writes = []
  registerPetNotification({ on(event, callback) {
    assert.equal(event, 'xiaoc/notification')
    handler = callback
  } }, {
    ready: () => ready,
    state: { writePet: (...entry) => writes.push(entry) },
  })
  assert.equal(handler({ text: '收到 2 封新邮件', animation: '招手' }), undefined)
  assert.deepEqual(writes, [])
  ready = true
  assert.equal(handler({ text: '收到 2 封新邮件', animation: '招手' }), true)
  assert.deepEqual(writes, [
    ['xiaoc', 'say', { text: '收到 2 封新邮件', anim: false }],
    ['xiaoc', 'anim', { name: '招手' }],
  ])
})
