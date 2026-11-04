/** Installed GenUI regression isolated from model requests and employee settings. */
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'

it('serves the offline runtime and authenticates reversible prompt controls', async () => {
  const { stdout } = await promisify(execFile)(process.execPath, [join(import.meta.dirname, 'fixtures/genui-offline.mjs')], { timeout: 20_000 })
  const result = stdout.split('\n').find(line => line.startsWith('GENUI_RESULT='))
  expect(result).toBeDefined()
  expect(JSON.parse(result!.slice('GENUI_RESULT='.length))).toMatchSnapshot()
})
