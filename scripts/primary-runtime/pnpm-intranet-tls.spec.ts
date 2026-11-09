/** Exercise the packaged pnpm registry client against a private self-signed HTTPS fixture. */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:https'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { c as packTar } from 'tar'
import { expect, it } from 'vitest'
import { patchPnpmIntranetTls } from './pnpm-intranet-tls.ts'

it('installs a local plugin with an internal proxy tarball and verifies TLS on other routes', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xiaoc-pnpm-tls-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const pnpm = join(root, 'pnpm')
  await cp(dirname(createRequire(import.meta.url).resolve('pnpm')), pnpm, { recursive: true })
  patchPnpmIntranetTls(pnpm)
  expect(() => patchPnpmIntranetTls(pnpm)).toThrow('replacement site changed')

  const selfsigned = createRequire(new URL('../../packages/host/webserver/package.json', import.meta.url))('selfsigned') as {
    generate(
      attributes: { name: string; value: string }[], options: { keySize: number; algorithm: string },
    ): { private: string; cert: string }
  }
  const pem = selfsigned.generate([{ name: 'commonName', value: '127.0.0.1' }], { keySize: 2048, algorithm: 'sha256' })
  const pkg = { name: '@xiaoc/tls-fixture', version: '1.0.0' }
  const packagePath = '/repository/npm/@xiaoc%2Ftls-fixture'
  const tarballPath = '/repository/npm-proxy/@xiaoc/tls-fixture/-/tls-fixture-1.0.0.tgz'
  await mkdir(join(root, 'package'))
  await writeFile(join(root, 'package/package.json'), JSON.stringify(pkg))
  await packTar({ cwd: root, file: join(root, 'fixture.tgz'), gzip: true }, ['package'])
  const tarball = await readFile(join(root, 'fixture.tgz'))
  const plugin = { name: 'xiaoc-local-plugin', version: '1.0.0', dependencies: { [pkg.name]: pkg.version } }
  const pluginArchive = join(root, 'plugin.tgz')
  await writeFile(join(root, 'package/package.json'), JSON.stringify(plugin))
  await packTar({ cwd: root, file: pluginArchive, gzip: true }, ['package'])
  const requests: string[] = []
  let origin = ''
  let redirected = false
  const other = createServer({ key: pem.private, cert: pem.cert }, (_request, response) => {
    redirected = true
    response.end()
  })
  t.onTestFinished(() => new Promise<void>((resolve) => { other.close(() => resolve()); other.closeAllConnections() }))
  await new Promise<void>((resolve, reject) => { other.once('error', reject); other.listen(0, '127.0.0.1', resolve) })
  const otherAddress = other.address()
  if (otherAddress === null || typeof otherAddress === 'string') throw new Error('Redirect fixture did not bind to a TCP port')
  const otherOrigin = 'https://127.0.0.1:' + otherAddress.port
  const server = createServer({ key: pem.private, cert: pem.cert }, (request, response) => {
    const path = request.url ?? ''
    requests.push(path)
    if (path.endsWith('/redirect-fixture')) {
      response.writeHead(302, { location: '/other/redirect-target' }).end()
    } else if (path.endsWith('/cross-origin-fixture')) {
      response.writeHead(302, { location: otherOrigin + '/repository/npm/redirect-target' }).end()
    } else if (path === tarballPath) {
      response.end(tarball)
    } else {
      const integrity = 'sha512-' + createHash('sha512').update(tarball).digest('base64')
      const manifest = { ...pkg, dist: { tarball: origin + tarballPath, integrity } }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({
        name: pkg.name, 'dist-tags': { latest: pkg.version }, versions: { [pkg.version]: manifest },
        time: { [pkg.version]: '2020-01-01T00:00:00.000Z' },
      }))
    }
  })
  t.onTestFinished(() => new Promise<void>((resolve) => { server.close(() => resolve()); server.closeAllConnections() }))
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
  const address = server.address()
  if (address === null || typeof address === 'string') throw new Error('HTTPS fixture did not bind to a TCP port')
  origin = 'https://127.0.0.1:' + address.port

  const entry = join(pnpm, 'dist/pnpm.mjs')
  const source = await readFile(entry, 'utf8')
  expect(source.match(/url\.origin !== "https:\/\/25\.75\.3\.1"/gu)).toHaveLength(1)
  await writeFile(entry, source.replace('url.origin !== "https://25.75.3.1"', 'url.origin !== ' + JSON.stringify(origin)))
  const project = join(root, 'project')
  await mkdir(project)
  await writeFile(join(project, 'package.json'), '{"name":"private-tls-fixture","private":true}')
  await writeFile(join(project, 'pnpm-workspace.yaml'), 'packages: []\nminimumReleaseAge: 0\ntrustPolicy: off\nupdateNotifier: false\nfetchRetries: 0\n')
  const run = (path: string, command: string[], enabled = true) => promisify(execFile)(process.execPath, [
    join(pnpm, 'bin/pnpm.mjs'), ...command, '--registry=' + origin + path,
  ], { cwd: project, timeout: 15000, env: {
    PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, HOME: root, USERPROFILE: root,
    APPDATA: root, LOCALAPPDATA: root, XDG_CONFIG_HOME: root, XDG_CACHE_HOME: root,
    CI: 'true', DSH_ZHIWEI_PLUGIN_PNPM: enabled ? '1' : '0',
  } })

  const tlsError = { stdout: expect.stringMatching(/self.signed certificate/i) }
  await expect(run('/repository/npm/', ['view', pkg.name, 'version'], false)).rejects.toMatchObject(tlsError)
  await run('/repository/npm/', ['add', pluginArchive, '--ignore-scripts'])
  expect(requests).toContain(packagePath)
  expect(requests).toContain(tarballPath)
  const installedPlugin = join(project, 'node_modules', plugin.name, 'package.json')
  expect(JSON.parse(await readFile(installedPlugin, 'utf8'))).toEqual(plugin)
  const installedDependency = createRequire(await realpath(installedPlugin)).resolve(pkg.name + '/package.json')
  expect(JSON.parse(await readFile(installedDependency, 'utf8'))).toEqual(pkg)
  await expect(run('/repository/npm-other/', ['view', pkg.name, 'version'])).rejects.toMatchObject(tlsError)
  await expect(run('/repository/npm-proxy/', ['view', pkg.name, 'version'])).rejects.toMatchObject(tlsError)
  await expect(run('/repository/npm/', ['view', 'redirect-fixture', 'version'])).rejects.toMatchObject(tlsError)
  expect(requests).toContain('/repository/npm/redirect-fixture')
  expect(requests).not.toContain('/other/redirect-target')
  await expect(run('/repository/npm/', ['view', 'cross-origin-fixture', 'version'])).rejects.toMatchObject(tlsError)
  expect(requests).toContain('/repository/npm/cross-origin-fixture')
  expect(redirected).toBe(false)
}, 40000)
