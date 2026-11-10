/** Stage the Desktop-only capability packages for the production pnpm install. */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { workshopSeed } from '../src/workshop-seed.ts'

/** Exact versions shipped by the Desktop capability overlay. */
export const desktopCapabilityVersions = { 'dsh-context': '0.83.0' } as const

/** Verify the installer Workshop seed and declare the runtime overlay dependency.
 * @param projectRoot - Disposable pnpm project root.
 * @param resources - Checked-in Desktop capability resource directory.
 */
export function prepareRuntimeCapabilities(projectRoot: string, resources: string): void {
  const archive = readFileSync(join(resources, workshopSeed.filename))
  if (createHash('sha512').update(archive).digest('hex') !== workshopSeed.sha512) {
    throw new Error('desktop capabilities: Workshop archive integrity mismatch')
  }
  const manifestPath = join(projectRoot, 'package.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as { dependencies: Record<string, string> }
  manifest.dependencies['dsh-context'] = desktopCapabilityVersions['dsh-context']
  writeFileSync(manifestPath, JSON.stringify(manifest, undefined, 2) + '\n')
}
