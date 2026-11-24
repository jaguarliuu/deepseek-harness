/** Workshop smoke requests use Desktop's private HTTP authentication. */
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import WebServer from '@deepseek-ai/dsh-host-webserver'
import * as Connection from '@deepseek-ai/dsh-client-connection'
import * as DesktopAuthentication from '@deepseek-ai/dsh-host-authentication-desktop'
import { create } from 'tar'
import { expect, it, onTestFinished, vi } from 'vitest'
import { smokeWorkshop } from '../scripts/smoke-workshop.ts'
import { DesktopHostProcess } from '../src/host-process.ts'
import { DesktopWorkshop, type WorkshopUpdateRequest } from '../src/workshop.ts'
import { workshopSeed } from '../src/workshop-seed.ts'

it('authenticates Workshop updates with the readiness Cookie without a URL login', async () => {
  const home = await mkdtemp(join(tmpdir(), 'workshop-smoke-auth-'))
  onTestFinished(async () => { await rm(home, { recursive: true, force: true }) })
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose() })
  onTestFinished(() => { vi.restoreAllMocks() })
  const secret = Buffer.alloc(32, 7).toString('base64url')
  const cookie = `dsh-desktop-session=${secret}`
  await ctx.plugin(WebServer, { host: '127.0.0.1', port: 0 }).await()
  await ctx.plugin(Connection).await()
  await ctx.plugin(DesktopAuthentication, { readSecret: () => secret }).await()
  const requests: { path: string | undefined; cookie: string | undefined }[] = []
  ctx.on('webserver/request', async (request, _response, next) => {
    requests.push({ path: request.url, cookie: request.headers.cookie })
    await next()
  })
  let onUpdate: ((request: WorkshopUpdateRequest) => void) | undefined
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/assets-hub/rpc',
    handler(_request, response) {
      onUpdate?.({ archive: join(home, 'upgrade.tgz'), version: '0.3.5', assetId: 'plugin:42' })
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ data: { updating: true } }))
    },
  }))
  const profile = join(home, 'profiles', 'desktop')
  await mkdir(profile, { recursive: true })
  const source = join(home, 'seed')
  await mkdir(join(source, 'package'), { recursive: true })
  await writeFile(join(source, 'package', 'package.json'), JSON.stringify({ version: workshopSeed.version }))
  const seed = join(home, 'seed.tgz')
  await create({ file: seed, cwd: source, gzip: true }, ['package'])
  const host = new DesktopHostProcess(process.execPath, home, profile)
  vi.spyOn(host, 'start').mockResolvedValue({
    url: ctx.webServer.getOrigin(), authenticationCookie: cookie, injections: [], workshopVersion: workshopSeed.version,
  })
  const stop = vi.spyOn(host, 'stop').mockResolvedValue()
  const workshop = new DesktopWorkshop(profile, {
    node: process.execPath, dsh: home, pnpm: 'unused', nodeBin: home,
  }, seed)
  const reachedUpdate = new Error('authenticated Workshop replacement reached')
  const update = vi.spyOn(workshop, 'update').mockRejectedValue(reachedUpdate)
  await expect(smokeWorkshop(home, profile, seed, workshop, (listener) => {
    onUpdate = listener
    return host
  })).rejects.toBe(reachedUpdate)
  expect(update).toHaveBeenCalledOnce()
  expect(requests).toEqual([{ path: '/assets-hub/rpc', cookie }])
  expect(stop).toHaveBeenCalledOnce()
}, 30_000)
