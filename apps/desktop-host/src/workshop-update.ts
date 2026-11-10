/** Redirect the legacy Workshop self-updater to the Desktop Host handoff. */
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

interface WorkshopUpdateRequest {
  readonly archive: string
  readonly version: string
  readonly assetId: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    desktopWorkshopUpdate: (request: WorkshopUpdateRequest) => Promise<void>
  }
}

/** Adapt only the profile-owned Workshop installer, keeping its package files intact.
 * @param profile - Desktop profile containing the installed package.
 * @returns A predicate that reports whether the installed self-updater was adapted.
 */
export function installWorkshopUpdateHandoff(profile: string): () => boolean {
  const entry = join(profile, 'node_modules', 'dsh-asset-hub', 'installer.js')
  let adapted = false
  if (!existsSync(entry)) return () => false
  const url = pathToFileURL(realpathSync(entry)).href
  const start = "    if (packageName === 'dsh-asset-hub') {\n      if (selfUpdating)"
  const end = '    const removed = await service.removeBundle(packageName)'
  registerHooks({
    load(address, context, nextLoad) {
      const loaded = nextLoad(address, context)
      if (address !== url) return loaded
      const source = readFileSync(entry, 'utf8')
      const begin = source.indexOf(start)
      const finish = source.indexOf(end, begin)
      const rollback = source.lastIndexOf('    let rollback = null', begin)
      if (begin === -1 || finish === -1 || rollback === -1 || source.lastIndexOf(start) !== begin) return loaded
      adapted = true
      return { ...loaded, source: source.slice(0, rollback) + `    const to = version || from
    if (packageName === 'dsh-asset-hub') {
      const handoff = ctx.get('desktopWorkshopUpdate')
      if (!handoff) throw new HubError({ code: 'UPDATE_UNAVAILABLE', message: '桌面端工坊更新服务暂不可用' })
      await handoff({ archive: target.tarball, version: to, assetId: String(id) })
      return { kind: 'plugin', installed: true, updating: true, self: true, from, to, packageName, restartRequired: true }
    }

` + source.slice(rollback, begin).replace('    const to = version || from\n', '') + source.slice(finish) }
    },
  })
  return () => adapted
}
