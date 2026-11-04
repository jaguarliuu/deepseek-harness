/** Keyless full Host composition against a loopback-only platform fixture. */
import { createServer } from 'node:http'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import ToolRuntime from '@deepseek-ai/dsh-tools'
import SystemPrompt from '@deepseek-ai/dsh-system-prompt'
import { LocalJobRegistry } from '@deepseek-ai/dsh-jobs-local'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import LocalFs from '@deepseek-ai/dsh-fs-local'
import { expect, it, onTestFinished } from 'vitest'
import IntranetAi from '../src/index.ts'
import { platformOrigin } from '../src/platform.ts'
import type { AiTask } from '../src/types.ts'

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoc-intranet-'))
  const state = {
    expire: false,
    refreshes: 0,
    submissions: 0,
    lastBody: '',
    asset: '/static/result.png',
    brokenAudio: false,
    status: 'succeeded',
    rejectSubmit: false,
    rejectStatus: 0,
    account: 'employee',
  }
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZ8AAAAASUVORK5CYII=',
    'base64',
  )
  const wav = Buffer.alloc(48)
  wav.write('RIFF')
  wav.writeUInt32LE(40, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(24000, 24)
  wav.writeUInt32LE(48000, 28)
  wav.writeUInt16LE(2, 32)
  wav.writeUInt16LE(16, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(4, 40)
  const server = createServer((req, res) => {
    void (async () => {
      const chunks: Buffer[] = []
      for await (const raw of req) {
        const chunk: unknown = raw
        if (Buffer.isBuffer(chunk)) chunks.push(chunk)
        else throw new Error('Invalid body chunk')
      }
      const body = Buffer.concat(chunks).toString()
      const path = req.url ?? ''
      const json = (value: object, status = 200) => {
        res.writeHead(status, { 'Content-Type': 'application/json' }).end(JSON.stringify(value))
      }
      if (path === '/healthz') {
        json({ ok: true })
        return
      }
      const tokens = () => ({
        success: true,
        data: {
          access_token: state.expire ? 'fresh' : 'initial',
          refresh_token: `refresh-${state.refreshes}`,
          expires_in: 900,
        },
      })
      if (path === '/api/auth/login') {
        json(tokens())
        return
      }
      if (path === '/api/auth/refresh') {
        state.refreshes++
        json(tokens())
        return
      }
      if (path === '/api/auth/logout') {
        json({ success: true })
        return
      }
      if (state.expire && req.headers.authorization !== 'Bearer fresh') {
        json({ message: 'private platform error' }, 401)
        return
      }
      if (path === '/static/result.png') {
        res.writeHead(200, { 'Content-Type': 'image/png' }).end(png)
        return
      }
      if (path === '/static/result.wav') {
        res
          .writeHead(200, { 'Content-Type': state.brokenAudio ? 'text/html' : 'audio/wav' })
          .end(state.brokenAudio ? '<html>login</html>' : wav)
        return
      }
      if (path.endsWith('/cancel')) {
        state.status = 'canceled'
        json({ success: true, status: state.status })
        return
      }
      if (path.includes('/history/')) {
        const id = Number(path.split('/').pop())
        json({
          id,
          status: state.status,
          images: [{ url: state.asset }],
          audio_url: '/static/result.wav',
          markdown: '# 识别正文\n设备巡检完成。',
          n_pages: 20,
          total_pages: 30,
          truncated: true,
        })
        return
      }
      if (req.method === 'POST') {
        state.submissions++
        if (state.rejectStatus) { json({ success: false, message: 'private input failure' }, state.rejectStatus); return }
        state.lastBody = body
        if (state.rejectSubmit) {
          req.socket.destroy()
          return
        }
        const result = { id: state.submissions, status: 'queued' }
        json(path.includes('/image/') ? result : { success: true, data: result })
        return
      }
      json({}, 404)
    })().catch(() => {
      res.writeHead(500).end()
    })
  })
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No listener')
  const url = `http://127.0.0.1:${address.port}`
  const ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    server.closeAllConnections()
    await new Promise<void>((resolve) => {
      server.close(() => {
        resolve()
      })
    })
    await rm(dir, { recursive: true, force: true })
  })
  await ctx.plugin(SystemPrompt)
  await ctx.plugin(ToolRuntime)
  await ctx.plugin(LocalJobRegistry)
  await ctx.plugin(LocalFs)
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, 'credentials.yml'), watch: false })
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  ctx.loader.builtins.intranet = IntranetAi
  const config = {
    baseUrl: url,
    imageModels: ['internal-image'],
    voices: ['vivian'],
    dataPath: join(dir, 'tasks'),
    requestTimeoutMs: 1000,
    pollMs: 300,
    queuePollMs: 1500,
    monitorMs: 3000,
  }
  await ctx.loader.root.update([{ id: 'ai', name: 'cordis:intranet', config }])
  await ctx.loader.await()
  expect(await ctx.intranetAi.login('employee', 'test-only-password')).toEqual({ ok: true, code: 'authorized' })
  return { ctx, state, url, dir, config }
}

it('normalizes three response formats and retains downloadable artifacts and OCR truncation', async () => {
  const { ctx, state, dir } = await fixture()
  const results = []
  for (const capability of ['image', 'tts', 'ocr'] as const) {
    const task = await ctx.intranetAi.tasks.submit({
      capability,
      text: '内部能力测试',
      ...(capability === 'ocr'
        ? { filename: 'scan.pdf', fileBase64: Buffer.from('%PDF-1.4 test').toString('base64') }
        : {}),
    })
    if (capability === 'ocr') expect(state.lastBody).toContain('Content-Type: application/pdf')
    const done = await ctx.intranetAi.tasks.monitor(task.id)
    expect(done.status).toBe('succeeded')
    expect(done.files).toHaveLength(1)
    const artifact = await ctx.intranetAi.artifact(done.id, done.files[0]!)
    expect(artifact.base64.length).toBeGreaterThan(0)
    expect(ctx.intranetAi.tasks.modelResult(done)).toContain(join(dir, 'tasks', task.id))
    results.push({
      capability: done.capability,
      status: done.status,
      files: done.files,
      markdown: done.markdown,
      truncated: done.truncated,
      pages: done.pages,
      totalPages: done.totalPages,
    })
  }
  await expect(JSON.stringify(results, null, 2) + '\n').toMatchFileSnapshot('./expected/capabilities.json')
  expect(await readFile(join(dir, 'credentials.yml'), 'utf8')).not.toContain('test-only-password')
})

it('serializes token rotation and refuses an expected-account mismatch', async () => {
  const { ctx, state, url } = await fixture()
  state.expire = true
  const results = await Promise.all([
    ctx.intranetAi.platform.request(url, '/api/image/history/1'),
    ctx.intranetAi.platform.request(url, '/api/image/history/1'),
  ])
  await Promise.all(
    results.map(async (r) => {
      await r.body?.cancel()
    }),
  )
  expect(state.refreshes).toBe(1)
  await ctx.intranetAi.login('another-user', 'test-only-password')
  await expect(ctx.intranetAi.platform.request(url, '/api/image/history/1', {}, undefined, 'employee')).rejects.toThrow(
    'accountChanged',
  )
})

it('retains uncertain submissions and never automatically submits twice', async () => {
  const { ctx, state } = await fixture()
  state.rejectSubmit = true
  await expect(ctx.intranetAi.tasks.submit({ capability: 'image', text: 'test' })).rejects.toThrow('submissionUnknown')
  expect(state.submissions).toBe(1)
  const tasks = await ctx.intranetAi.list()
  expect(tasks[0]).toMatchObject({ status: 'unknown', remoteId: 0, notice: 'submissionUnknown' })
  expect(await ctx.intranetAi.resume(tasks[0]!.id)).toEqual({ ok: false, code: 'notFound' })
})

it('blocks foreign artifact origins and HTML disguised as speech output', async () => {
  const { ctx, state } = await fixture()
  state.asset = 'https://untrusted.invalid/static/result.png'
  const image = await ctx.intranetAi.tasks.submit({ capability: 'image', text: 'test' })
  expect(await ctx.intranetAi.tasks.monitor(image.id)).toMatchObject({ notice: 'downloadFailed', files: [] })
  state.brokenAudio = true
  const audio = await ctx.intranetAi.tasks.submit({ capability: 'tts', text: 'test' })
  expect(await ctx.intranetAi.tasks.monitor(audio.id)).toMatchObject({ notice: 'downloadFailed', files: [] })
})

it('preserves server-confirmed cancellation and recovers interrupted submission records', async () => {
  const { ctx, state, dir, config } = await fixture()
  state.status = 'queued'
  const task = await ctx.intranetAi.tasks.submit({ capability: 'image', text: 'test' })
  await ctx.intranetAi.tasks.cancel(task.id)
  expect(await ctx.intranetAi.tasks.monitor(task.id)).toMatchObject({ status: 'canceled' })
  const previous: AiTask[] = await ctx.intranetAi.list()
  previous[0]!.status = 'submitting'
  previous[0]!.remoteId = 0
  await ctx.loader.root.update([])
  await ctx.loader.await()
  expect(ctx.tools.definitions().some(t => t.name.startsWith('intranet_'))).toBe(false)
  await writeFile(join(dir, 'tasks', 'tasks.json'), JSON.stringify({ version: 1, tasks: previous }))
  await ctx.loader.root.update([{ id: 'ai', name: 'cordis:intranet', config }])
  await ctx.loader.await()
  expect((await ctx.intranetAi.list())[0]).toMatchObject({ status: 'unknown', notice: 'submissionUnknown' })
})

it('rejects credential-bearing, non-HTTP and non-root platform addresses', () => {
  for (const value of ['file:///tmp/x', 'https://u:p@host', 'https://host/api', 'https://host?secret=1'])
    expect(() => platformOrigin(value)).toThrow()
  expect(platformOrigin('https://internal.example/')).toBe('https://internal.example')
})


it('distinguishes definite rejection from uncertain transport outcomes', async () => {
  const { ctx, state } = await fixture()
  state.rejectStatus = 400
  await expect(ctx.intranetAi.tasks.submit({ capability: 'image', text: 'test' })).rejects.toThrow('invalidInput')
  expect((await ctx.intranetAi.list())[0]).toMatchObject({ status: 'failed', notice: 'invalidInput', remoteId: 0 })
  const submitted = state.submissions
  await expect(ctx.intranetAi.tasks.submit({ capability: 'ocr', text: '', filename: 'file.pdf', fileBase64: 'invalid-base64' })).rejects.toThrow('invalidInput')
  expect(state.submissions).toBe(submitted)
})
