import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it } from 'vitest'
import yaml from 'js-yaml'
import { pnpmCommand } from '../../../scripts/release/process.ts'
import { prepareRuntimeUrlDependencies } from '../scripts/prepare-runtime-url-dependencies.ts'

const roots: string[] = []
const url = 'https://codeload.github.com/JackEngineer/dsh-quick-screenshot/tar.gz/c8e7c11b7f16198b39f7300ce877206554a0694d'
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 })
})
function fixture(bytes = Buffer.from('archive')): { root: string; project: string; source: string } {
  const root = mkdtempSync(join(tmpdir(), 'desktop-url-dependency-'))
  roots.push(root)
  const source = join(root, 'source')
  const project = join(root, 'project')
  mkdirSync(join(source, 'packages/bundle/web-app'), { recursive: true })
  mkdirSync(project)
  writeFileSync(join(source, 'packages/bundle/web-app/package.json'), JSON.stringify({ dependencies: { 'dsh-quick-screenshot': url } }))
  writeFileSync(join(source, 'pnpm-lock.yaml'), yaml.dump({ packages: {
    [`dsh-quick-screenshot@${url}`]: { resolution: { tarball: url, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } },
  } }))
  writeFileSync(join(project, 'pnpm-workspace.yaml'), yaml.dump({ packages: ['.'], blockExoticSubdeps: true, overrides: { existing: '1.0.0' } }))
  return { root, project, source }
}

it('stages verified bytes and preserves other dependency policies', async () => {
  const { source, project } = fixture()
  const before = readFileSync(join(source, 'pnpm-lock.yaml'))
  await prepareRuntimeUrlDependencies(project, source, async (input) => {
    expect(input).toBe(url)
    return new Response('archive')
  })
  expect(readFileSync(join(project, 'url-dependencies/dsh-quick-screenshot.tgz'), 'utf8')).toBe('archive')
  expect(yaml.load(readFileSync(join(project, 'pnpm-workspace.yaml'), 'utf8'))).toMatchObject({
    blockExoticSubdeps: true, overrides: { existing: '1.0.0', 'dsh-quick-screenshot': 'file:./url-dependencies/dsh-quick-screenshot.tgz' },
  })
  expect(readFileSync(join(source, 'pnpm-lock.yaml'))).toEqual(before)
})

it.each(['source', 'lockfile', 'bytes', 'http', 'override'] as const)('rejects invalid archive preparation: %s', async (failure) => {
  const { source, project } = fixture()
  if (failure === 'source') writeFileSync(join(source, 'packages/bundle/web-app/package.json'), JSON.stringify({ dependencies: {} }))
  if (failure === 'lockfile') writeFileSync(join(source, 'pnpm-lock.yaml'), 'packages: {}\n')
  if (failure === 'override') writeFileSync(join(project, 'pnpm-workspace.yaml'), yaml.dump({ overrides: { 'dsh-quick-screenshot': 'other' } }))
  const before = readFileSync(join(project, 'pnpm-workspace.yaml'))
  await expect(prepareRuntimeUrlDependencies(project, source, async () => failure === 'http'
    ? new Response('', { status: 503 }) : new Response(failure === 'bytes' ? 'corrupt' : 'archive'))).rejects.toThrow('desktop URL dependency:')
  expect(readFileSync(join(project, 'pnpm-workspace.yaml'))).toEqual(before)
  expect(existsSync(join(project, 'url-dependencies'))).toBe(false)
})

it('installs a transitive URL dependency from the staged archive with exotic subdependencies blocked', async () => {
  const { root, source, project } = fixture()
  const run = promisify(execFile)
  const env = Object.fromEntries(Object.entries(process.env).filter(([name]) => (
    /^(?:path|systemroot|windir|comspec|temp|tmp)$/iu.test(name)
  )))
  const packageDir = join(root, 'package')
  mkdirSync(packageDir)
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'dsh-quick-screenshot', version: '1.0.0' }))
  await run('tar', ['-czf', join(root, 'screenshot.tgz'), '-C', root, 'package'], { env, timeout: 15_000, windowsHide: true })
  const bytes = readFileSync(join(root, 'screenshot.tgz'))
  writeFileSync(join(source, 'pnpm-lock.yaml'), yaml.dump({ packages: {
    [`dsh-quick-screenshot@${url}`]: { resolution: { tarball: url, integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` } },
  } }))
  writeFileSync(join(packageDir, 'package.json'), JSON.stringify({ name: 'web-bundle-fixture', version: '1.0.0', dependencies: { 'dsh-quick-screenshot': url } }))
  await run('tar', ['-czf', join(project, 'bundle.tgz'), '-C', root, 'package'], { env, timeout: 15_000, windowsHide: true })
  writeFileSync(join(project, 'package.json'), JSON.stringify({ private: true, dependencies: { 'web-bundle-fixture': 'file:./bundle.tgz' } }))
  await prepareRuntimeUrlDependencies(project, source, async () => new Response(bytes))
  writeFileSync(join(project, 'npmrc'), '')
  const [command, ...prefix] = pnpmCommand()
  const args = [...prefix, '--config.userconfig=' + join(project, 'npmrc'), '--config.store-dir=' + join(project, 'store'), '--config.manage-package-manager-versions=false', 'install', '--offline', '--ignore-scripts']
  await run(command, args, { cwd: project, env: { ...env, CI: 'true' }, timeout: 30_000, windowsHide: true })
  const require = createRequire(join(project, 'node_modules/web-bundle-fixture/package.json'))
  expect(JSON.parse(readFileSync(require.resolve('dsh-quick-screenshot/package.json'), 'utf8'))).toMatchObject({ name: 'dsh-quick-screenshot' })
}, 60_000)
