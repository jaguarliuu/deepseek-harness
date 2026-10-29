/** Validated local skill bundle installation; a failed upload never overwrites an existing skill. */
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { parse } from 'yaml'
import { isSkillName } from '@deepseek-ai/dsh-skill'
import type { SkillImportRequest, SkillImportValue } from './types.ts'

/**
 * Validate and install a skill in the workspace's discoverable skill directory.
 * @param cwd - Authoritative Session working directory.
 * @param files - User-supplied bundle files, with paths relative to its root.
 * @param signal - Caller cancellation, observed before publishing SKILL.md.
 * @returns Installed skill name; existing names and malformed bundles reject without replacement.
 */
export async function importWorkspaceSkill(cwd: string, files: SkillImportRequest['files'], signal: AbortSignal): Promise<SkillImportValue> {
  if (files.length === 0 || files.length > 256) throw new Error('A skill bundle must contain between 1 and 256 files')
  const names = new Set<string>()
  let size = 0
  const entries = files.map((file) => {
    const parts = file.path.split('/')
    if (parts.some(part => part === '' || part === '.' || part === '..' || /[\\:*?"<>|\x00-\x1f]/u.test(part)
      || /[. ]$/u.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\.|$)/iu.test(part))) throw new Error('Invalid skill file path')
    const key = file.path.toLowerCase()
    if (names.has(key)) throw new Error('Duplicate skill file path')
    names.add(key)
    if (file.base64.length > 14_000_000 || Buffer.from(file.base64, 'base64').toString('base64') !== file.base64) throw new Error('Invalid skill file encoding')
    const data = Buffer.from(file.base64, 'base64')
    size += data.length
    if (size > 10 * 1024 * 1024) throw new Error('Skill bundle exceeds 10 MiB')
    return { path: file.path, data }
  })
  const document = entries.find(entry => entry.path === 'SKILL.md')
  const frontmatter = document?.data.toString('utf8').match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/u)?.[1]
  if (document === undefined || frontmatter === undefined) throw new Error('SKILL.md must include YAML frontmatter')
  const metadata: unknown = parse(frontmatter)
  if (typeof metadata !== 'object' || metadata === null || !('name' in metadata) || typeof metadata.name !== 'string'
    || !isSkillName(metadata.name) || !('description' in metadata) || typeof metadata.description !== 'string'
    || metadata.description.trim() === '') throw new Error('Skill name and description are required')
  if ('disable-model-invocation' in metadata && typeof metadata['disable-model-invocation'] !== 'boolean') throw new Error('Skill invocation flags must be boolean')
  if ('user-invocable' in metadata && typeof metadata['user-invocable'] !== 'boolean') throw new Error('Skill invocation flags must be boolean')
  signal.throwIfAborted()
  const root = join(cwd, '.agents', 'skills')
  await mkdir(root, { recursive: true })
  const target = join(root, metadata.name)
  // Exclusive ownership: a pre-existing directory, file or symlink is never touched.
  await mkdir(target)
  try {
    for (const entry of entries.filter(entry => entry.path !== 'SKILL.md')) {
      signal.throwIfAborted()
      const path = join(target, entry.path)
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path, entry.data, { flag: 'wx' })
    }
    signal.throwIfAborted()
    await writeFile(join(target, 'SKILL.md'), document.data, { flag: 'wx' })
  } catch (error) {
    await rm(target, { recursive: true, force: true })
    throw error
  }
  return { name: metadata.name }
}
