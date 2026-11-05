/** Adapt the pinned pnpm payload's atomic writes to its existing Windows file-lock retry policy. */
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Route both bundled write-file-atomic copies through pnpm's bounded rename helper.
 * @param directory - Copied pnpm package; the build host's installation is never modified.
 * @throws Error when the pinned version or bundled replacement sites have changed.
 */
export function patchPnpmAtomicWrites(directory: string): void {
  const manifest = JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')) as { version: string }
  if (manifest.version !== '11.28.5') throw new Error('primary runtime: review the pnpm atomic-write patch for version ' + manifest.version)
  const entry = join(directory, 'dist', 'pnpm.mjs')
  const source = readFileSync(entry, 'utf8')
  const original = 'await promisify15(fs207.rename)(tmpfile, truename);'
  if (source.split(original).length !== 3 || !source.includes('function renameFileWithRetryAsync(')
    || !source.includes('var init_lib7 = __esm(')) {
    throw new Error('primary runtime: pnpm atomic-write replacement sites changed')
  }
  writeFileSync(entry, source.replaceAll(original, 'init_lib7();\n        await renameFileWithRetryAsync(tmpfile, truename);'))
}
