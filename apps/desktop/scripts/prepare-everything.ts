/** Materialize the pinned offline Everything client before sealing the Windows runtime. */
import { createHash } from 'node:crypto'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { unzipSync } from 'fflate'

/** Official portable distribution checksum, verified against voidtools' SHA256 manifest. */
export const EVERYTHING_SHA256 = '698df475ec44e638f66f1b6a32d28fea613cec78d3b6310e6abe53431eeb940c'

/**
 * Copy the verified portable client and notices; never fetch files on an employee's computer.
 * @param runtimeRoot - Materialized Desktop dependency tree.
 * @param target - Distribution platform and architecture.
 * @param resourceRoot - Directory containing the reviewed ZIP and license.
 * @returns Resolves after all Windows x64 search binaries are present.
 */
export async function prepareEverything(
  runtimeRoot: string, target: { platform: string; arch: string },
  resourceRoot = join(import.meta.dirname, '..', 'resources', 'everything'),
): Promise<void> {
  if (target.platform !== 'win32' || target.arch !== 'x64') return
  const root = join(runtimeRoot, 'node_modules', 'dsh-plugin-everything')
  for (const file of ['index.js', 'sdk-worker.cjs', 'native/Everything64.dll', 'vendor/@koromix/koffi-win32-x64/win32_x64/koffi.node']) {
    await readFile(join(root, file))
  }
  const bytes = await readFile(join(resourceRoot, 'Everything-1.4.1.1032.x64.zip'))
  if (createHash('sha256').update(bytes).digest('hex') !== EVERYTHING_SHA256) {
    throw new Error('Everything portable archive checksum mismatch')
  }
  const files = unzipSync(bytes)
  const destination = join(root, 'portable')
  await mkdir(destination, { recursive: true })
  for (const name of ['everything.exe', 'Everything.lng']) {
    const content = files[name]
    if (content === undefined) throw new Error(`Everything portable archive is missing ${name}`)
    await writeFile(join(destination, name), content)
  }
  await copyFile(join(resourceRoot, 'LICENSE.txt'), join(destination, 'LICENSE.txt'))
}
