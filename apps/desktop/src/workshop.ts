/** Owns the offline Workshop seed and stopped-Host upgrade transaction. */
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { readFile, realpath, rm, stat } from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { gt, valid } from 'semver'
import { list } from 'tar'
import { z } from 'zod'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { desktopNodeEnvironment } from './node-environment.ts'
import { workshopSeed } from './workshop-seed.ts'

const name = workshopSeed.name
const manifestName = 'package.json'
const lockfileName = 'pnpm-lock.yaml'
const journalSchema = z.object({ manifest: z.string(), lockfile: z.string().nullable(), ledger: z.string().nullable() })
const installedSchema = z.object({ name: z.literal(name), version: z.string(), dsh: z.object({ bundle: z.object({ patch: z.string() }) }) })

/** Private Host request to replace the active Workshop with a downloaded archive. */
export interface WorkshopUpdateRequest {
  readonly archive: string
  readonly version: string
  readonly assetId: string
}

interface WorkshopRuntime {
  readonly node: string
  readonly dsh: string
  readonly nodeBin: string
  readonly pnpm: string
}

interface WorkshopLifecycle {
  stop(): Promise<void>
  start(): Promise<string | undefined>
  resume(): Promise<void>
}

async function optionalText(path: string): Promise<string | null> {
  try { return await readFile(path, 'utf8') }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function archiveManifest(archive: string): z.infer<typeof installedSchema> {
  const chunks: Buffer[] = []
  let seen = false
  list({
    file: archive, sync: true, strict: true,
    onReadEntry(entry) {
      if (entry.path !== 'package/package.json') return
      if (seen || entry.type !== 'File' || entry.size > 128 * 1024) throw new Error('Invalid Workshop package manifest')
      seen = true
      entry.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    },
  })
  return installedSchema.parse(JSON.parse(Buffer.concat(chunks).toString('utf8')))
}

/** Install Workshop only in the Desktop profile and recover interrupted replacements before Host boot. */
export class DesktopWorkshop {
  private readonly home: string
  private readonly journal: string
  private readonly ledger: string
  private readonly marker: string
  private busy = false

  /** @param profile - Desktop-owned plugin profile.
   * @param runtime - Bundled Desktop CLI and package manager.
   * @param seedArchive - Installer-owned, checksum-pinned Workshop archive.
   * @param environment - Package-operation environment, with Desktop's profile location supplied by this class.
   */
  constructor(
    private readonly profile: string, private readonly runtime: WorkshopRuntime, private readonly seedArchive: string,
    private readonly environment: NodeJS.ProcessEnv = process.env,
  ) {
    this.home = dirname(dirname(profile))
    this.journal = join(profile, '.workshop-replacement.json')
    this.ledger = join(this.home, 'asset-hub', 'installs.json')
    this.marker = join(profile, '.workshop-seeded')
  }

  private async command(args: string[]): Promise<void> {
    const home = await realpath(this.home)
    const profile = join(home, 'profiles', 'desktop')
    const cli = join(this.runtime.dsh, 'node_modules', '@deepseek-ai', 'dsh-desktop-host', 'lib', 'cli.js')
    await promisify(execFile)(this.runtime.node, ['--expose-internals', cli, 'plugin', '--profile', 'desktop', ...args], {
      cwd: profile, windowsHide: true, timeout: 120_000, maxBuffer: 2 * 1024 * 1024,
      env: { ...desktopNodeEnvironment(this.runtime.node, this.runtime.nodeBin, this.environment), DSH_HOME: home,
        DSH_DESKTOP_PNPM_ENTRY: this.runtime.pnpm, DSH_DESKTOP_NODE_BIN: this.runtime.nodeBin },
    })
  }

  private packageSpec(archive: string): string {
    return 'file:' + relative(this.profile, archive).split(sep).join('/')
  }

  private async installed(): Promise<string | undefined> {
    const manifest = await optionalText(join(this.profile, 'node_modules', name, manifestName))
    if (manifest === null) return undefined
    return installedSchema.parse(JSON.parse(manifest)).version
  }

  private async begin(): Promise<void> {
    const manifest = await readFile(join(this.profile, manifestName), 'utf8')
    const lockfile = await optionalText(join(this.profile, lockfileName))
    await writeFileAtomic(this.journal, JSON.stringify({ manifest, lockfile, ledger: await optionalText(this.ledger) }), { mode: 0o600 })
  }

  private async recover(): Promise<void> {
    const pending = await optionalText(this.journal)
    if (pending === null) return
    const { manifest, lockfile, ledger } = journalSchema.parse(JSON.parse(pending))
    await writeFileAtomic(join(this.profile, manifestName), manifest, { mode: 0o600 })
    if (lockfile === null) await rm(join(this.profile, lockfileName), { force: true })
    else await writeFileAtomic(join(this.profile, lockfileName), lockfile, { mode: 0o600 })
    if (ledger === null) await rm(this.ledger, { force: true })
    else await writeFileAtomic(this.ledger, ledger, { mode: 0o600 })
    await this.command(['install', '--offline', '--ignore-scripts', lockfile === null ? '--config.lockfile=false' : '--frozen-lockfile'])
    await rm(this.journal)
  }

  /** Seed an uninitialized profile offline, preserving an existing installation and selection. */
  async prepare(): Promise<void> {
    await this.recover()
    if (await optionalText(this.marker) !== null) return
    const manifest = JSON.parse(await readFile(join(this.profile, manifestName), 'utf8')) as { dependencies?: Record<string, string> }
    if (Object.hasOwn(manifest.dependencies ?? {}, name)) {
      if (await this.installed() === undefined) await this.command(['install', '--offline', '--ignore-scripts', '--frozen-lockfile'])
      if (await this.installed() === undefined) throw new Error('Existing Workshop dependency is missing from the Desktop profile')
    } else {
      const bytes = await readFile(this.seedArchive)
      if (createHash('sha512').update(bytes).digest('hex') !== workshopSeed.sha512) throw new Error('Workshop seed checksum mismatch')
      const seed = join(this.profile, '.workshop', workshopSeed.filename)
      await writeFileAtomic(seed, bytes, { mode: 0o600 })
      await this.begin()
      try {
        await this.command(['add', this.packageSpec(seed), '--offline', '--ignore-scripts', '--save-exact'])
        if (await this.installed() !== workshopSeed.version) throw new Error('Workshop seed did not install its expected version')
        await rm(this.journal)
      } catch (error) {
        try { await this.recover() }
        catch (rollback) { throw new AggregateError([error, rollback], 'Workshop seed failed and could not be rolled back') }
        throw error
      }
    }
    await writeFileAtomic(this.marker, workshopSeed.version, { mode: 0o600 })
  }

  /** Replace Workshop after Host shutdown. Restore and restart the previous profile on failure.
   * @param request - Downloaded archive, target version and Workshop asset identity.
   * @param lifecycle - Desktop-owned Host controls and workspace navigation.
   */
  async update(request: WorkshopUpdateRequest, lifecycle: WorkshopLifecycle): Promise<void> {
    if (this.busy) throw new Error('A Workshop update is already in progress')
    this.busy = true
    try {
      const previous = await this.installed()
      if (previous === undefined || valid(previous) === null || valid(request.version) === null || !gt(request.version, previous)) {
        throw new Error('Workshop update must target a newer version of the installed package')
      }
      const root = await realpath(join(this.home, 'asset-hub', 'plugins'))
      const archive = await realpath(request.archive)
      const path = relative(root, archive)
      const info = await stat(archive)
      if (!isAbsolute(request.archive) || isAbsolute(path) || path === '..' || path.startsWith('..' + sep)
        || !info.isFile() || info.size > 32 * 1024 * 1024 || !basename(archive).endsWith('.tgz') || !/^[\w.-]{1,128}$/u.test(request.assetId)) {
        throw new Error('Workshop update archive is outside its download directory or is invalid')
      }
      const staged = join(this.profile, '.workshop', `dsh-asset-hub-${request.version}.tgz`)
      await writeFileAtomic(staged, await readFile(archive), { mode: 0o600 })
      if (archiveManifest(staged).version !== request.version) throw new Error('Workshop update archive version does not match the request')
      await lifecycle.stop()
      try {
        await this.begin()
        await this.command(['add', this.packageSpec(staged), '--ignore-scripts', '--save-exact'])
        if (await this.installed() !== request.version || await lifecycle.start() !== request.version) {
          throw new Error('The new Desktop Host did not activate the requested Workshop version')
        }
        const data = z.record(z.string(), z.unknown()).parse(JSON.parse(await optionalText(this.ledger) ?? '{}'))
        const key = `plugin:${request.assetId}`
        const prior = z.record(z.string(), z.unknown()).safeParse(data[key])
        data[key] = { ...prior.data, kind: 'plugin', id: request.assetId, packageName: name, version: request.version,
          tarball: staged, dir: dirname(staged), installedAt: new Date().toISOString() }
        await writeFileAtomic(this.ledger, JSON.stringify(data, null, 2), { mode: 0o600 })
        await rm(this.journal)
      } catch (error) {
        try {
          await lifecycle.stop()
          await this.recover()
          if (await lifecycle.start() !== previous) throw new Error('The previous Workshop version did not restart')
          await lifecycle.resume()
        } catch (rollback) {
          throw new AggregateError([error, rollback], 'Workshop update failed and could not be rolled back')
        }
        throw new Error('Workshop update failed; the previous version was restored', { cause: error })
      }
      await lifecycle.resume()
    } finally {
      this.busy = false
    }
  }
}
