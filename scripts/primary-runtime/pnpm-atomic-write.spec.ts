/** Verify the shipped pnpm rename policy and an offline install through its patched entry. */
import { execFile } from 'node:child_process'
import { cp, mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { promisify } from 'node:util'
import { runInNewContext } from 'node:vm'
import { expect, it } from 'vitest'
import { patchPnpmAtomicWrites } from './pnpm-atomic-write.ts'
const pnpm = dirname(createRequire(import.meta.url).resolve('pnpm'))
const source = await readFile(join(pnpm, 'dist/pnpm.mjs'), 'utf8')

function retryHarness(platform: string, failures: number, code: string) {
  let now = 0
  let calls = 0
  const failure = Object.assign(new Error('locked'), { code })
  const begin = source.indexOf('async function renameFileWithRetryAsync(')
  const end = source.indexOf('var import_graceful_fs, FILE_LOCK_RETRY_BUDGET_MS', begin)
  expect(begin).toBeGreaterThan(0)
  expect(end).toBeGreaterThan(begin)
  const context = {
    process: { platform }, os2: { release: () => 'test' }, isError: (value: unknown) => value instanceof Error,
    Date: { now: () => now }, FILE_LOCK_RETRY_BUDGET_MS: 60000,
    PERMISSION_DENIED_RETRY_BUDGET_MS: 1000, FILE_LOCK_RETRY_BACKOFF_CAP_MS: 100,
    setTimeout: (callback: () => void, ms: number) => { now += ms; callback() },
    fs4: { promises: { rename: async () => { if (++calls <= failures) throw failure } } },
  }
  const rename = runInNewContext(source.slice(begin, end) + '\nrenameFileWithRetryAsync', context) as (from: string, to: string) => Promise<void>
  return { run: () => rename('package.json.tmp', 'package.json'), calls: () => calls, elapsed: () => now, failure }
}
it.each(['EPERM', 'EACCES', 'EBUSY'])('retries a transient Windows %s on the same rename', async (code) => {
  const h = retryHarness('win32', 2, code)
  await h.run()
  expect(h.calls()).toBe(3)
})
it('keeps a persistent Windows permission failure bounded and preserves its error', async () => {
  const h = retryHarness('win32', Infinity, 'EPERM')
  await expect(h.run()).rejects.toBe(h.failure)
  expect(h.elapsed()).toBe(1000)
})
it.each([['darwin', 'EPERM'], ['win32', 'EIO']])('does not retry %s/%s', async (platform, code) => {
  const h = retryHarness(platform!, Infinity, code!)
  await expect(h.run()).rejects.toBe(h.failure)
  expect(h.calls()).toBe(1)
  expect(h.elapsed()).toBe(0)
})
it('ships both patched atomic writers and installs a local plugin without network access', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'xiaoc-pnpm-rename-'))
  t.onTestFinished(() => rm(root, { recursive: true, force: true }))
  const copied = join(root, 'pnpm')
  await cp(pnpm, copied, { recursive: true })
  patchPnpmAtomicWrites(copied)
  const patched = await readFile(join(copied, 'dist/pnpm.mjs'), 'utf8')
  expect(patched.match(/await renameFileWithRetryAsync\(tmpfile, truename\);/gu)).toHaveLength(2)
  const project = join(root, 'project')
  const plugin = join(root, 'plugin')
  await mkdir(project); await mkdir(plugin)
  await writeFile(join(project, 'package.json'), '{"name":"pnpm-rename-smoke","private":true}')
  await writeFile(join(project, 'pnpm-workspace.yaml'), 'packages: []\n')
  await writeFile(join(plugin, 'package.json'), '{"name":"local-rename-plugin","version":"1.0.0"}')
  const result = await promisify(execFile)(process.execPath, [join(copied, 'bin/pnpm.mjs'), 'add', 'file:' + plugin, '--offline', '--ignore-scripts', '--config.update-notifier=false'], {
    cwd: project, timeout: 30000, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      HOME: root, USERPROFILE: root, APPDATA: root, LOCALAPPDATA: root, CI: 'true' },
  })
  expect(result.stderr).not.toContain('EPERM')
  const manifest = JSON.parse(await readFile(join(project, 'package.json'), 'utf8')) as { dependencies: Record<string, string> }
  expect(manifest.dependencies['local-rename-plugin']).toBeDefined()
  expect(JSON.parse(await readFile(join(project, 'node_modules/local-rename-plugin/package.json'), 'utf8'))).toMatchObject({ name: 'local-rename-plugin' })
  // An altered bundle or a double application must fail rather than silently ship unpatched code.
  expect(() => patchPnpmAtomicWrites(copied)).toThrow('replacement sites changed')
  await writeFile(join(copied, 'package.json'), '{"version":"0.0.0"}')
  expect(() => patchPnpmAtomicWrites(copied)).toThrow('review the pnpm atomic-write patch')
}, 45000)
