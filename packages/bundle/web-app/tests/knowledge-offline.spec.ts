/** Installed knowledge-plugin regression, isolated from employee data and model credentials. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('imports and searches Word and PDF offline with authenticated disposable routes', async () => {
  const home = await mkdtemp(join(tmpdir(), 'xiaoc-kb-test-'))
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [join(import.meta.dirname, 'fixtures/knowledge-offline.mjs')], {
      env: { ...process.env, DSH_HOME: home }, timeout: 30_000,
    })
    const result = stdout.split('\n').find(line => line.startsWith('KNOWLEDGE_RESULT='))
    expect(result).toBeDefined()
    expect(JSON.parse(result!.slice('KNOWLEDGE_RESULT='.length))).toMatchSnapshot()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
