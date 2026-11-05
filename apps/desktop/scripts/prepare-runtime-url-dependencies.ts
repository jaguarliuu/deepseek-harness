/** Stage reviewed URL dependencies as integrity-checked local tarballs for pnpm. */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import yaml from 'js-yaml'

/**
 * Materialize the screenshot archive pinned by the Web bundle and workspace lockfile.
 * pnpm's exotic-subdependency restriction remains enabled for every other dependency.
 * @param projectRoot Disposable runtime project containing pnpm-workspace.yaml.
 * @param repositoryRoot Source checkout containing the reviewed bundle and lockfile.
 * @param download Archive transport; defaults to the platform fetch implementation.
 * @returns Resolves after verified bytes and a local dependency override are written.
 */
export async function prepareRuntimeUrlDependencies(
  projectRoot: string, repositoryRoot: string, download: typeof fetch = fetch,
): Promise<void> {
  const name = 'dsh-quick-screenshot'
  const manifest = JSON.parse(readFileSync(join(repositoryRoot, 'packages/bundle/web-app/package.json'), 'utf8')) as {
    dependencies: Record<string, string>
  }
  const url = manifest.dependencies[name]
  if (url === undefined || !/^https:\/\/codeload\.github\.com\/JackEngineer\/dsh-quick-screenshot\/tar\.gz\/[a-f0-9]{40}$/u.test(url)) {
    throw new Error('desktop URL dependency: review the screenshot archive source')
  }
  const lock = yaml.load(readFileSync(join(repositoryRoot, 'pnpm-lock.yaml'), 'utf8')) as {
    packages: Record<string, { resolution?: { integrity?: string; tarball?: string } }>
  }
  const resolution = lock.packages[`${name}@${url}`]?.resolution
  if (resolution?.tarball !== url || !/^sha512-[A-Za-z0-9+/]{86}==$/u.test(resolution.integrity ?? '')) {
    throw new Error('desktop URL dependency: screenshot archive needs a matching SHA-512 lockfile entry')
  }
  const response = await download(url, { signal: AbortSignal.timeout(120_000) })
  if (!response.ok) throw new Error(`desktop URL dependency: screenshot download failed (HTTP ${String(response.status)})`)
  const bytes = Buffer.from(await response.arrayBuffer())
  if (`sha512-${createHash('sha512').update(bytes).digest('base64')}` !== resolution.integrity) {
    throw new Error('desktop URL dependency: screenshot archive integrity mismatch')
  }
  const path = join(projectRoot, 'pnpm-workspace.yaml')
  const settings = yaml.load(readFileSync(path, 'utf8')) as Record<string, unknown> & { overrides?: Record<string, string> }
  const spec = 'file:./url-dependencies/dsh-quick-screenshot.tgz'
  if (settings.overrides?.[name] !== undefined && settings.overrides[name] !== spec) {
    throw new Error('desktop URL dependency: conflicting screenshot override')
  }
  mkdirSync(join(projectRoot, 'url-dependencies'), { recursive: true })
  writeFileSync(join(projectRoot, 'url-dependencies/dsh-quick-screenshot.tgz'), bytes)
  writeFileSync(path, yaml.dump({ ...settings, overrides: { ...settings.overrides, [name]: spec } }))
}
