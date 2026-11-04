/** Verify real offline archive materialization and tamper rejection without executing Windows binaries. */
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { prepareEverything } from '../scripts/prepare-everything.ts'

it('stages the verified portable client and rejects a corrupt archive', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xiaoc-everything-'))
  const resources = resolve(import.meta.dirname, '../resources/everything')
  try {
    const plugin = join(root, 'node_modules/dsh-plugin-everything')
    for (const file of ['index.js', 'sdk-worker.cjs', 'native/Everything64.dll', 'vendor/@koromix/koffi-win32-x64/win32_x64/koffi.node']) {
      await mkdir(join(plugin, file, '..'), { recursive: true })
      await writeFile(join(plugin, file), 'fixture')
    }
    await prepareEverything(root, { platform: 'win32', arch: 'x64' }, resources)
    expect((await readFile(join(plugin, 'portable/everything.exe'))).subarray(0, 2).toString()).toBe('MZ')
    expect((await readFile(join(plugin, 'portable/Everything.lng'))).length).toBeGreaterThan(0)
    expect(await readFile(join(plugin, 'portable/LICENSE.txt'), 'utf8')).toContain('David Carpenter')
    const corrupt = join(root, 'corrupt')
    await mkdir(corrupt)
    await copyFile(join(resources, 'LICENSE.txt'), join(corrupt, 'LICENSE.txt'))
    await writeFile(join(corrupt, 'Everything-1.4.1.1032.x64.zip'), 'corrupt')
    await expect(prepareEverything(root, { platform: 'win32', arch: 'x64' }, corrupt)).rejects.toThrow('checksum mismatch')
    await expect(prepareEverything(root, { platform: 'darwin', arch: 'arm64' }, corrupt)).resolves.toBeUndefined()
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('rejects a missing SDK before producing a partial search runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'xiaoc-everything-missing-'))
  try {
    await expect(prepareEverything(root, { platform: 'win32', arch: 'x64' })).rejects.toThrow('ENOENT')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
