/** Stage the Desktop-only capability packages for the production pnpm install. */
import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const WORKSHOP_ARCHIVE = 'dsh-asset-hub-0.3.3.tgz'
const WORKSHOP_SHA512 = '5be8a00657d4001a402bea75029d23df3ec65c3d65b3e65f19ce8f15b97c5e7fc6c1c1d2254167ba25b9aa3c5e36a93ac1e21859c09f2addeb7d8ec2b7705a03'

/** Exact versions shipped by the Desktop capability overlay. */
export const desktopCapabilityVersions = { 'dsh-asset-hub': '0.3.3', 'dsh-context': '0.83.0' } as const

/** Stage the verified Workshop archive and declare the overlay dependencies.
 * @param projectRoot - Disposable pnpm project root.
 * @param resources - Checked-in Desktop capability resource directory.
 */
export function prepareRuntimeCapabilities(projectRoot: string, resources: string): void {
  const archive = readFileSync(join(resources, WORKSHOP_ARCHIVE))
  if (createHash('sha512').update(archive).digest('hex') !== WORKSHOP_SHA512) {
    throw new Error('desktop capabilities: Workshop archive integrity mismatch')
  }
  const directory = join(projectRoot, 'capabilities')
  mkdirSync(directory, { recursive: true })
  writeFileSync(join(directory, WORKSHOP_ARCHIVE), archive)
  const manifestPath = join(projectRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
  manifest.dependencies['dsh-asset-hub'] = 'file:./capabilities/' + WORKSHOP_ARCHIVE
  manifest.dependencies['dsh-context'] = desktopCapabilityVersions['dsh-context']
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
}
