/** Boot the materialized target runtime without access to a user's Harness profile. */

import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { readPrimaryRuntime, workspaceDependencyPaths } from '../../../packages/skill/tool-workspace-dependencies/src/index.ts'
import { DesktopHostProcess } from '../src/host-process.ts'
import { DesktopWorkshop, type WorkshopUpdateRequest } from '../src/workshop.ts'
import { workshopSeed } from '../src/workshop-seed.ts'
import { smokeWorkshop } from './smoke-workshop.ts'
import { createPluginProfile } from '../src/project-manager.ts'
import type { DesktopRuntimeDescriptor } from '../src/runtime-tree.ts'

/**
 * Check CLI package operations, Host startup, its frontend, external plugins and real Office-to-PDF conversion.
 * @param root - Materialized dsh resources.
 * @param node - Prepared target Electron executable.
 * @param runtime - Verified resource descriptor.
 * @param environment - Credential-scrubbed build environment and private native cache.
 * @param resourcesRuntime - Bundled interpreters outside the application archive.
 * @returns Resolves after checks and teardown; rejects on a check or teardown failure.
 */
export async function smokeDesktopRuntime(
  root: string, node: string, runtime: DesktopRuntimeDescriptor, environment: NodeJS.ProcessEnv, resourcesRuntime: string,
): Promise<void> {
  const home = realpathSync.native(mkdtempSync(join(tmpdir(), 'dsh-desktop-smoke-')))
  const profile = join(home, 'profiles', 'desktop')
  const hostEnvironment = {
    ...Object.fromEntries(Object.entries(environment).filter(([name]) => !/^(?:npm|pnpm|corepack)_/iu.test(name))),
    DSH_HOME: home, HOME: home, USERPROFILE: home,
    XDG_CONFIG_HOME: home, XDG_CACHE_HOME: home, XDG_STATE_HOME: home,
    APPDATA: home, LOCALAPPDATA: home,
    npm_config_userconfig: join(home, 'npmrc'), npm_config_globalconfig: join(home, 'npmrc'),
    npm_config_store_dir: join(home, 'store'), npm_config_enable_global_virtual_store: 'false',
  }
  const createHost = (onUpdate?: (request: WorkshopUpdateRequest) => void) => new DesktopHostProcess(
    node, root, profile, undefined, hostEnvironment, undefined, join(resourcesRuntime, 'primary-runtime'),
    { pnpm: join(resourcesRuntime, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'), nodeBin: join(resourcesRuntime, 'bin') },
    undefined, undefined, undefined, onUpdate)
  const host = createHost()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    writeFileSync(join(home, 'npmrc'), '')
    createPluginProfile(profile)
    const seed = basename(dirname(root)) === 'app.asar'
      ? join(dirname(resourcesRuntime), 'workshop', workshopSeed.filename)
      : fileURLToPath(new URL('../resources/workshop/' + workshopSeed.filename, import.meta.url))
    const workshop = new DesktopWorkshop(profile, { node, dsh: root,
      pnpm: join(resourcesRuntime, 'primary-runtime', 'dependencies', 'pnpm', 'bin', 'pnpm.mjs'), nodeBin: join(resourcesRuntime, 'bin') },
    seed, hostEnvironment)
    await workshop.prepare()
    await smokeWorkshop(home, profile, seed, workshop, createHost)
    const pluginName = 'desktop-runtime-smoke-plugin'
    const plugin = join(home, pluginName)
    mkdirSync(plugin, { recursive: true })
    const installedName = 'desktop-installed-smoke-plugin'
    const installedPlugin = join(home, installedName)
    mkdirSync(installedPlugin)
    writeFileSync(join(installedPlugin, 'package.json'), JSON.stringify({
      name: installedName, version: '1.0.0', type: 'module', exports: './index.js', dsh: { bundle: { patch: './bundle.yml' } },
    }))
    writeFileSync(join(installedPlugin, 'index.js'), `
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-installed',
    handler(_request, response) { response.end('installed plugin ready') } }))
}
`)
    writeFileSync(join(installedPlugin, 'bundle.yml'), `- insert:\n    - id: ${installedName}\n      name: ${installedName}\n      inject: [webServer]\n`)
    appendFileSync(join(profile, 'pnpm-workspace.yaml'), 'offline: true\nupdateNotifier: false\n')
    const cli = join(root, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    const runCli = (args: string[]) => promisify(execFile)(node,
      ['--expose-internals', cli, 'plugin', '--profile', 'desktop', ...args],
      { cwd: home, env: { ...hostEnvironment, ELECTRON_RUN_AS_NODE: '1' }, timeout: 120_000, windowsHide: true })
    await runCli(['add', `file:${installedPlugin}`, '--offline', '--ignore-scripts'])
    const installedEntry = join(profile, 'node_modules', installedName, 'index.js')
    if (readFileSync(installedEntry, 'utf8') !== readFileSync(join(installedPlugin, 'index.js'), 'utf8')) {
      throw new Error('desktop runtime: CLI did not install the local plugin')
    }
    await runCli(['remove', installedName])
    if (existsSync(installedEntry)) throw new Error('desktop runtime: CLI did not remove the local plugin')
    console.log('desktop runtime: CLI offline plugin installation and removal passed')
    const primary = join(resourcesRuntime, 'primary-runtime')
    const dependencies = workspaceDependencyPaths(primary, await readPrimaryRuntime(primary))
    await promisify(execFile)(dependencies.python, ['-I', '-B',
      fileURLToPath(new URL('../tests/fixtures/office-conversion-inputs.py', import.meta.url)), home],
    { env: environment, timeout: 120_000, windowsHide: true })
    const inputs = ['docx', 'xlsx', 'pptx'].map(extension => ({ extension,
      bytes: readFileSync(join(home, `input.${extension}`)).toString('base64') }))
    const cordis = runtime.sharedPackages.find(entry => entry.name === '@deepseek-ai/cordis')
    if (cordis === undefined) throw new Error('desktop runtime: missing shared Cordis package')
    writeFileSync(join(plugin, 'package.json'), JSON.stringify({
      name: pluginName, version: '1.0.0', type: 'module', exports: './index.js',
      peerDependencies: { '@deepseek-ai/cordis': cordis.version }, dsh: { bundle: { patch: './bundle.yml' } },
    }))
    writeFileSync(join(plugin, 'index.js'), `
import { Context } from '@deepseek-ai/cordis'
import { inspect, promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
export function apply(ctx) {
  if (!(ctx instanceof Context)) throw new Error('desktop runtime: external plugin loaded another Cordis instance')
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke',
    handler(_request, response) { response.end('plugin route ready') } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-install',
    async handler(_request, response) {
      try {
        response.end(JSON.stringify(await ctx.pluginManager.installBundle(${JSON.stringify(installedPlugin)})))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-sources',
    async handler(request, response) {
      try {
        if (request.method === 'POST') {
          await ctx.settings.mutate('plugin-manager', [{ op: 'set', path: ['registry'], value: 'https://npm.example.invalid/' }])
          await ctx.settings.mutate('subprocess', [{ op: 'set', path: ['environment', 'PIP_INDEX_URL'], value: 'https://pip.example.invalid/simple/' }])
        } else if (request.method === 'DELETE') {
          await ctx.settings.mutate('plugin-manager', [{ op: 'unset', path: ['registry'] }])
          await ctx.settings.mutate('subprocess', [{ op: 'unset', path: ['environment', 'PIP_INDEX_URL'] }])
        }
        const { registry, fallbackRegistries } = await ctx.pluginManager.registries()
        const python = ctx.subprocess.spawn({
          argv: [${JSON.stringify(dependencies.python)}, '-I', '-B', '-c',
            'import json, os; print(json.dumps([os.environ.get("PIP_INDEX_URL"), os.environ.get("PIP_TRUSTED_HOST")]))'],
          cwd: ${JSON.stringify(home)},
          signal: AbortSignal.timeout(15_000),
          stdio: { stdin: 'ignore', stdout: { maxBytes: 4096 }, stderr: { maxBytes: 4096 } },
          graceMs: 200,
        })
        const result = await python.done
        await python.waitForExit()
        if (result.exitCode !== 0) throw new Error('Python environment check failed')
        const pip = JSON.parse(python.collected.stdout.readFrom(0).text)
        const settings = ctx.settings.describe({ redactSecrets: true })
        response.end(JSON.stringify({
          registry, fallbackRegistries, pip,
          npmSetting: settings.find(row => row.ns === 'plugin-manager')?.value?.registry,
          pipSetting: settings.find(row => row.ns === 'subprocess')?.value?.environment?.PIP_INDEX_URL,
        }))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-office-cli',
    async handler(_request, response) {
      try {
        for (const name of ['office-docx', 'office-xlsx', 'office-pptx', 'office-pdf']) {
          if (await ctx.skills.get(name) === undefined) throw new Error('Missing bundled Office skill: ' + name)
        }
        for (const name of ['gov-doc-writing', 'meeting-recap', 'work-report-writer', 'dataset-health-audit', 'data-viz-gen']) {
          if (await ctx.skills.get(name) !== undefined) throw new Error('Unexpected bundled workplace skill: ' + name)
        }
        if (await ctx.skills.get('ops-workshop-publish') === undefined) throw new Error('Missing bundled Workshop skill')
        const active = new Set([...ctx.loader.entries()].filter(entry => entry.fiber !== undefined).map(entry => entry.options.name))
        for (const name of ['dsh-asset-hub', 'dsh-better-sidebar', 'dsh-context']) {
          if (!active.has(name)) throw new Error('Missing bundled capability: ' + name)
        }
        if (active.has('dshmarket')) throw new Error('Unexpected bundled DSH Market')
        const skill = await ctx.skills.get('office-export-pdf')
        const json = skill?.content.match(/\\n(\\{\\n[\\s\\S]+)$/u)?.[1]
        if (json === undefined) throw new Error('Office skill did not supply CLI paths')
        const { libreofficeKit: { node, cli } } = JSON.parse(json)
        const options = { cwd: ${JSON.stringify(home)}, env: { ...process.env, PATH: '' }, timeout: 120_000 }
        const capabilities = await promisify(execFile)(node, [cli, 'capabilities'], options)
        const output = ${JSON.stringify(join(home, 'cli.pdf'))}
        await promisify(execFile)(node, [cli, 'convert', '--input', ${JSON.stringify(join(home, 'input.docx'))}, '--output', output], options)
        response.end(JSON.stringify({ capabilities: JSON.parse(capabilities.stdout), pdf: (await readFile(output)).toString('base64') }))
      } catch (error) {
        response.statusCode = 500
        response.end(inspect(error, { depth: 5 }))
      }
    } }))
  for (const input of ${JSON.stringify(inputs)}) {
    ctx.effect(() => ctx.webServer.register({ kind: 'exact', path: '/desktop-smoke-office/' + input.extension,
      async handler(_request, response) {
        try {
          const bytes = Buffer.from(input.bytes, 'base64')
          const result = await ctx.officeToPdf.convert({ extension: input.extension, priority: 'foreground',
            source: { key: 'desktop-smoke-' + input.extension, version: 'fixture', bytes: bytes.length,
              async read() { return { bytes, version: 'fixture' } } } })
          response.end(Buffer.from(result.pdf))
        } catch (error) {
          response.statusCode = 500
          response.end(inspect(error, { depth: 5 }))
        }
      } }))
  }
}
`)
    writeFileSync(join(plugin, 'bundle.yml'), '- insert:\n    - id: desktop-runtime-smoke-plugin\n      name: desktop-runtime-smoke-plugin\n      inject: [webServer, officeToPdf, skills, pluginManager, loader, subprocess, settings]\n')
    cpSync(plugin, join(profile, 'node_modules', pluginName), { recursive: true })
    const manifest = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      dsh: { profile: { bundles: string[] } }
    }
    manifest.dependencies = { ...manifest.dependencies, [pluginName]: `file:${plugin}` }
    manifest.dsh.profile.bundles.push(pluginName)
    writeFileSync(join(profile, 'package.json'), JSON.stringify(manifest))
    writeFileSync(join(profile, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n')
    const ready = await Promise.race([host.start(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new Error('desktop runtime: Host readiness exceeded 120 seconds')) }, 120_000)
    })])
    clearTimeout(timer)
    if (ready.workshopVersion === undefined) throw new Error('desktop runtime: Workshop seed did not activate')
    const login = await fetch(ready.url, { redirect: 'manual' })
    const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ')
    const response = await fetch(new URL('/', ready.url), { headers: { cookie } })
    if (response.status !== 200 || !(await response.text()).includes('<html')) {
      throw new Error('desktop runtime: packaged frontend smoke failed')
    }
    const workshopRoute = await fetch(new URL('/assets-hub/rpc', ready.url), {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: '{}',
    })
    if (workshopRoute.status !== 404 || !(await workshopRoute.text()).includes('UNKNOWN_METHOD')) {
      throw new Error(`desktop runtime: Workshop route failed (HTTP ${String(workshopRoute.status)})`)
    }
    const pluginResponse = await fetch(new URL('/desktop-smoke', ready.url), { headers: { cookie } })
    if (await pluginResponse.text() !== 'plugin route ready') throw new Error('desktop runtime: plugin HTTP route failed')
    const checkSources = async (method: string, npm: string, pip: string): Promise<void> => {
      const response = await fetch(new URL('/desktop-smoke-sources', ready.url), {
        method, headers: { cookie }, signal: AbortSignal.timeout(30_000),
      })
      const body = await response.text()
      const expected = { registry: npm, fallbackRegistries: [], pip: [pip, '25.75.3.1'], npmSetting: npm, pipSetting: pip }
      if (!response.ok || JSON.stringify(JSON.parse(body)) !== JSON.stringify(expected)) {
        throw new Error(`desktop runtime: intranet sources ${method} failed: ${body}`)
      }
    }
    const npm = 'https://25.75.3.1/repository/npm/'
    const pip = 'https://25.75.3.1/repository/pypi/simple'
    await checkSources('GET', npm, pip)
    await checkSources('POST', 'https://npm.example.invalid/', 'https://pip.example.invalid/simple/')
    await checkSources('DELETE', npm, pip)
    console.log('desktop runtime: intranet package source defaults, overrides and reset passed')
    const installation = await fetch(new URL('/desktop-smoke-install', ready.url), {
      headers: { cookie }, signal: AbortSignal.timeout(120_000),
    })
    const installationResult = await installation.text()
    const installed = await fetch(new URL('/desktop-smoke-installed', ready.url), { headers: { cookie } })
    if (!installation.ok || !installed.ok || await installed.text() !== 'installed plugin ready') {
      throw new Error(`desktop runtime: bundled pnpm plugin installation failed: ${installationResult}`)
    }
    for (const { extension } of inputs) {
      const converted = await fetch(new URL(`/desktop-smoke-office/${extension}`, ready.url), {
        headers: { cookie }, signal: AbortSignal.timeout(120_000),
      })
      if (!converted.ok) throw new Error(`desktop runtime: ${extension} conversion failed: ${await converted.text()}`)
      const pdf = Buffer.from(await converted.arrayBuffer())
      const output = join(home, `converted.${extension}.pdf`)
      writeFileSync(output, pdf)
      await promisify(execFile)(dependencies.python, ['-I', '-B', '-c',
        'from pypdf import PdfReader; import sys; r = PdfReader(sys.argv[1]); assert len(r.pages) > 0; assert \"Desktop Office conversion\" in \"\".join(p.extract_text() for p in r.pages)', output],
      { env: { ...environment, PATH: '' }, timeout: 120_000, windowsHide: true })
      if (!/^%PDF-\d\.\d/u.test(pdf.subarray(0, 8).toString())
        || !pdf.subarray(-1024).toString().trimEnd().endsWith('%%EOF')) {
        throw new Error(`desktop runtime: invalid ${extension} PDF output`)
      }
    }
    const cliResponse = await fetch(new URL('/desktop-smoke-office-cli', ready.url), {
      headers: { cookie }, signal: AbortSignal.timeout(120_000),
    })
    if (!cliResponse.ok) throw new Error(`desktop runtime: skill CLI failed: ${await cliResponse.text()}`)
    const cliResult = await cliResponse.json() as { capabilities: { runtime: { cliPath: string } }; pdf: string }
    if (!cliResult.capabilities.runtime.cliPath.endsWith('cli.js') || Buffer.from(cliResult.pdf, 'base64').subarray(0, 5).toString() !== '%PDF-') {
      throw new Error('desktop runtime: skill CLI did not return capabilities and a PDF')
    }
    console.log('desktop runtime: DOCX, XLSX, PPTX to PDF and skill CLI discovery passed')
  } finally {
    clearTimeout(timer)
    try { await host.stop() } finally {
      await rm(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 50 })
    }
  }
}
