import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { importWorkspaceSkill } from '../src/skill-import.ts'

const file = (path: string, content: string) => ({ path, base64: Buffer.from(content).toString('base64') })
const document = file('SKILL.md', '---\nname: office-review\ndescription: Review documents\n---\nReview the document.\n')
async function workspace() {
  const cwd = await mkdtemp(join(tmpdir(), 'skill-import-'))
  onTestFinished(() => rm(cwd, { recursive: true, force: true }))
  return cwd
}
it('installs instructions and nested resources without replacing an existing skill', async () => {
  const cwd = await workspace()
  const files = [document, file('scripts/review.py', 'print("review")')]
  await expect(importWorkspaceSkill(cwd, files, new AbortController().signal)).resolves.toEqual({ name: 'office-review' })
  expect(await readFile(join(cwd, '.agents/skills/office-review/scripts/review.py'), 'utf8')).toBe('print("review")')
  await expect(importWorkspaceSkill(cwd, [document], new AbortController().signal)).rejects.toThrow()
  expect(await readFile(join(cwd, '.agents/skills/office-review/SKILL.md'), 'utf8')).toContain('Review the document.')
})
it.each(['../escape', '/absolute', 'scripts/../../escape', 'scripts\\escape', 'CON.txt', 'foo.'])('rejects unsafe path %s before writing', async (path) => {
  const cwd = await workspace()
  await expect(importWorkspaceSkill(cwd, [document, file(path, 'x')], new AbortController().signal)).rejects.toThrow('Invalid skill file path')
  expect(await readdir(cwd)).toEqual([])
})
it('rolls back a partially installed bundle on a path collision', async () => {
  const cwd = await workspace()
  await expect(importWorkspaceSkill(cwd, [document, file('scripts', 'file'), file('scripts/run.py', 'x')], new AbortController().signal)).rejects.toThrow()
  expect(await readdir(join(cwd, '.agents/skills'))).toEqual([])
})
it('rejects malformed metadata, duplicate paths, invalid encoding and cancellation', async () => {
  const cwd = await workspace()
  for (const files of [[file('SKILL.md', 'no metadata')], [document, document], [{ path: 'SKILL.md', base64: '!!!!' }]]) {
    await expect(importWorkspaceSkill(cwd, files, new AbortController().signal)).rejects.toThrow()
  }
  await expect(importWorkspaceSkill(cwd, [document], AbortSignal.abort())).rejects.toThrow()
  expect(await readdir(cwd)).toEqual([])
})
