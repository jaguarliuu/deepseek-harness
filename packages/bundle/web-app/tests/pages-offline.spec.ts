/** Installed Pages regression with isolated storage and no external model or browser. */
import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('creates versioned offline pages with authenticated state and HTML export', async () => {
  const home = await mkdtemp(join(tmpdir(), 'xiaoc-pages-test-'))
  try {
    const { stdout } = await promisify(execFile)(process.execPath, [join(import.meta.dirname, 'fixtures/pages-offline.mjs')], {
      env: { ...process.env, DSH_HOME: home, DSH_PAGES_CHECK: '0' }, timeout: 20_000,
    })
    const result = stdout.split('\n').find(line => line.startsWith('PAGES_RESULT='))
    expect(result).toBeDefined()
    expect(JSON.parse(result!.slice('PAGES_RESULT='.length))).toMatchSnapshot()
  } finally {
    await rm(home, { recursive: true, force: true })
  }
})
