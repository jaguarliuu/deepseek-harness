/** Exercise Workshop replacement against a real, isolated Desktop profile and Host. */
import assert from 'node:assert/strict'
import { EventEmitter, once } from 'node:events'
import { createServer } from 'node:http'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { create, extract } from 'tar'
import type { DesktopHostProcess } from '../src/host-process.ts'
import type { DesktopWorkshop, WorkshopUpdateRequest } from '../src/workshop.ts'
import { workshopSeed } from '../src/workshop-seed.ts'

/** Verify offline bootstrap, a stopped-Host upgrade, rollback, and retention of an existing profile.
 * @param home - Isolated Harness home.
 * @param profile - Isolated Desktop profile.
 * @param seed - Workshop tarball shipped by the installer.
 * @param workshop - Desktop transaction using the prepared runtime.
 * @param createHost - Starts a Host with the same packaged runtime as Desktop.
 */
export async function smokeWorkshop(
  home: string, profile: string, seed: string, workshop: DesktopWorkshop,
  createHost: (onUpdate: (request: WorkshopUpdateRequest) => void) => DesktopHostProcess,
): Promise<void> {
  const hub = join(home, 'asset-hub')
  const fixture = join(home, 'workshop-fixture')
  const plugins = join(hub, 'plugins')
  await mkdir(plugins, { recursive: true })
  await mkdir(fixture)
  await extract({ file: seed, cwd: fixture, strict: true })
  const packagePath = join(fixture, 'package', 'package.json')
  const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as { version: string }
  async function archive(version: string): Promise<string> {
    const file = join(plugins, `dsh-asset-hub-${version}.tgz`)
    await writeFile(packagePath, JSON.stringify({ ...manifest, version }))
    await create({ file, cwd: fixture, gzip: true, portable: true }, ['package'])
    return file
  }
  const upgraded = '0.3.5'
  const good = await archive(upgraded)
  await writeFile(join(fixture, 'package', 'index.js'), 'throw new Error("Workshop smoke activation failure")\n')
  const broken = '0.3.6'
  const archives = new Map([[upgraded, await readFile(good)], [broken, await readFile(await archive(broken))]])
  const assetId = 42
  const endpoint = `/api/v1/assets/plugin/${assetId}`
  let offeredVersion = upgraded
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === endpoint) {
      response.setHeader('Content-Type', 'application/json')
      response.end(JSON.stringify({ data: { id: assetId, kind: 'plugin', name: 'Workshop', package_name: workshopSeed.name, latest_version: offeredVersion } }))
    } else if (url.pathname === endpoint + '/download' && url.searchParams.get('version') === offeredVersion) {
      response.end(archives.get(offeredVersion))
    } else {
      response.writeHead(404).end()
    }
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert(address !== null && typeof address !== 'string')
  const ledgerPath = join(hub, 'installs.json')
  const overlayPath = join(profile, 'cordis.patch.yml')
  const overlay = `- id: asset-hub
  config:
    baseUrl: http://127.0.0.1:${String(address.port)}
    token: ops_pat_workshop_smoke
`
  const requests = new EventEmitter<{ update: [WorkshopUpdateRequest] }>()
  const newHost = () => createHost((request) => { requests.emit('update', request) })
  let host = newHost()
  let hostUrl: string
  let version: string | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  const start = async (): Promise<string | undefined> => {
    const ready = await Promise.race([host.start(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('Workshop smoke: Host readiness exceeded 120 seconds')) }, 120_000)
    })]).finally(() => { clearTimeout(timer) })
    hostUrl = ready.url
    version = ready.workshopVersion
    return version
  }
  const lifecycle = {
    stop: async () => { await host.stop() },
    start: async () => { host = newHost(); return start() },
    resume: async () => {},
  }
  const requestUpdate = async (target: string): Promise<WorkshopUpdateRequest> => {
    offeredVersion = target
    const login = await fetch(hostUrl, { redirect: 'manual', signal: AbortSignal.timeout(15_000) })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const [response, [request]] = await Promise.all([fetch(new URL('/assets-hub/rpc', hostUrl), {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ method: 'install', params: { kind: 'plugin', id: assetId } }),
      signal: AbortSignal.timeout(15_000),
    }), once(requests, 'update', { signal: AbortSignal.timeout(15_000) }) as Promise<[WorkshopUpdateRequest]>])
    const body: { data?: { updating?: boolean } } = JSON.parse(await response.text())
    assert.equal(response.ok && body.data?.updating, true, JSON.stringify(body))
    assert.equal(request.version, target)
    return request
  }
  try {
    await writeFile(overlayPath, overlay)
    assert.equal(await start(), workshopSeed.version)
    await workshop.update(await requestUpdate(upgraded), lifecycle)
    assert.equal(version, upgraded)
    assert.equal(await readFile(overlayPath, 'utf8'), overlay)
    const ledger = await readFile(ledgerPath, 'utf8')
    assert.equal(JSON.parse(ledger)[`plugin:${assetId}`].version, upgraded)
    const installedManifest = join(profile, 'package.json')
    const lockfile = join(profile, 'pnpm-lock.yaml')
    const previous = await readFile(installedManifest, 'utf8')
    const previousLock = await readFile(lockfile, 'utf8')
    await assert.rejects(workshop.update(await requestUpdate(broken), lifecycle),
      /previous version was restored/u)
    assert.equal(version, upgraded)
    assert.equal(await readFile(installedManifest, 'utf8'), previous)
    assert.equal(await readFile(lockfile, 'utf8'), previousLock)
    assert.equal(await readFile(overlayPath, 'utf8'), overlay)
    assert.equal(await readFile(ledgerPath, 'utf8'), ledger)
    await host.stop()
    const selection = JSON.parse(previous) as { dsh: { profile: { bundles: string[] } } }
    selection.dsh.profile.bundles = selection.dsh.profile.bundles.filter(name => name !== workshopSeed.name)
    const disabled = JSON.stringify(selection)
    await writeFile(installedManifest, disabled)
    await rm(join(profile, '.workshop-seeded'))
    await workshop.prepare()
    assert.equal(await readFile(installedManifest, 'utf8'), disabled)
    assert.equal(await readFile(overlayPath, 'utf8'), overlay)
    await writeFile(installedManifest, previous)
    await rm(overlayPath)
    console.log('desktop runtime: Workshop offline seed, independent upgrade, failed activation rollback and profile retention passed')
  } finally {
    try { await host.stop() } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => { server.close(() => { resolve() }) })
    }
  }
}
