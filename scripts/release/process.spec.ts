import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { create } from 'tar'
import { afterEach, describe, expect, it } from 'vitest'
import { capture, pnpmCommand } from './process.ts'
import { packedIdentity, packedManifest, tarballFiles } from './tarball.ts'

const directories: string[] = []
const unicodeFilename = '格式样板件_信函命令纪要_中文长文件名回归检查_20260901.md'

afterEach(async () => {
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true })
})

/**
 * Pack one manifest into a tarball shaped like `npm pack` output.
 * @returns Absolute path of the archive.
 */
async function packedTarball(name: string, version: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-tarball-'))
  directories.push(directory)
  const contents = join(directory, 'package')
  await mkdir(join(contents, '配套素材库'), { recursive: true })
  await writeFile(join(contents, 'package.json'), JSON.stringify({ name, version, description: '智维小 C 办公能力' }))
  await writeFile(join(contents, 'index.js'), '')
  const archive = join(directory, `${name.replaceAll('/', '-').replace('@', '')}-${version}.tgz`)
  await writeFile(join(contents, '配套素材库', unicodeFilename), '公文写作')
  await create({ file: archive, cwd: directory, gzip: true }, ['package'])
  return archive
}

describe('release process helpers', () => {
  it('runs pnpm through a JavaScript entry, which spawnSync can start on Windows', () => {
    const [command, ...args] = pnpmCommand()
    expect(command === 'pnpm' || /node(?:\.exe)?$/iu.test(command)).toBe(true)
    if (command !== 'pnpm') expect(args[0]).toMatch(/pnpm/u)
    expect(capture(command, [...args, '--version'])).toMatch(/^\d+\.\d+\.\d+/u)
  })
})

describe('release tarball readers', () => {
  it('lists UTF-8 and long member paths under an absolute archive path', async () => {
    const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
    expect(tarballFiles(archive)).toEqual(expect.arrayContaining(['package/package.json', 'package/index.js', `package/配套素材库/${unicodeFilename}`]))
  })

  it('reads what an archive declares about itself', async () => {
    const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
    expect(packedManifest(archive).description).toBe('智维小 C 办公能力')
    expect(packedIdentity(archive)).toEqual({ name: '@deepseek-ai/dsh-probe', version: '1.2.3' })
  })
})

it('rejects unreadable archives instead of accepting partial file lists', async () => {
  const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
  await writeFile(archive, 'invalid archive')
  expect(() => tarballFiles(archive)).toThrow()
  expect(() => packedManifest(archive)).toThrow()
})

it.each(['missing', 'directory', 'duplicate'] as const)('rejects a %s package manifest entry', async (kind) => {
  const archive = await packedTarball('@deepseek-ai/dsh-probe', '1.2.3')
  const directory = dirname(archive)
  const manifest = join(directory, 'package/package.json')
  if (kind !== 'duplicate') await rm(manifest)
  if (kind === 'directory') await mkdir(manifest)
  const members = kind === 'duplicate' ? ['package/package.json', 'package/package.json'] : ['package']
  await create({ file: archive, cwd: directory, gzip: true }, members)
  expect(() => packedManifest(archive)).toThrow(/manifest/u)
})
