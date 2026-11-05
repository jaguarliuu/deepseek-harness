/** Installed Univer payload: keyless Office export and offline policy regression. */
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { createRequire } from 'node:module'
import { expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'

it('creates and exports Office files with preserved built-in skills and no external resource requests', async () => {
  const home = await mkdtemp(join(tmpdir(), 'xiaoc-univer-test-'))
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [join(import.meta.dirname, 'fixtures/univer-offline.mjs')], {
      env: { ...process.env, DSH_HOME: home }, timeout: 60_000, maxBuffer: 1024 * 1024,
    })
    const line = stdout.split('\n').find(value => value.startsWith('UNIVER_RESULT='))
    expect(line).toBeDefined()
    expect(JSON.parse(line!.slice('UNIVER_RESULT='.length))).toMatchSnapshot()
  } finally {
    await rm(home, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
  }
}, 65_000)

it('ships the Viewer, render page, workers and State Grid theme in the installed plugin', async () => {
  const require = createRequire(new URL('../package.json', import.meta.url))
  const root = join(require.resolve('dsh-univer-office/package.json'), '..')
  const html = await readFile(join(root, 'artifacts/viewer/index.html'), 'utf8')
  expect(html).toContain('zhiwei-office-theme')
  expect(html).toContain('html:root')
  expect(html).toContain('--univer-primary-500:#007f76')
  for (const file of ['artifacts/gateway.cjs', 'artifacts/unit-content-worker.mjs',
    'artifacts/collaboration-runtime-worker.mjs', 'artifacts/render-machine/index.html']) {
    expect((await readFile(join(root, file))).length).toBeGreaterThan(0)
  }
})

it('mounts the pinned plugin with telemetry and online assets disabled in the shared Web and Desktop bundle', () => {
  const rows = loadOverlayPatches('univer-defaults', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  expect(rows.filter(row => row.id === 'univer')).toEqual([{
    id: 'univer', name: 'dsh-univer-office', config: { telemetry: false, resourceDownloads: false },
  }])
})

it('reuses the host Cordis, attachment and skill packages instead of installing another Harness runtime', () => {
  const host = createRequire(new URL('../package.json', import.meta.url))
  const plugin = createRequire(host.resolve('dsh-univer-office/package.json'))
  for (const name of ['@deepseek-ai/cordis', '@deepseek-ai/dsh-attachment', '@deepseek-ai/dsh-skill']) {
    expect(plugin.resolve(name)).toBe(host.resolve(name))
  }
})
