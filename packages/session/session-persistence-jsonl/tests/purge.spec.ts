import { Context } from '@deepseek-ai/cordis'
import { SESSION_FORMAT_VERSION, SessionId } from '@deepseek-ai/dsh-session'
import * as Jsonl from '@deepseek-ai/dsh-session-persistence-jsonl'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, onTestFinished } from 'vitest'
import { oneTurnLog } from '../../session-persistence/tests/contract.ts'

it('refuses an open Session, removes its closed artifacts, and preserves other Sessions', async () => {
  const root = await mkdtemp(join(tmpdir(), 'purge-session-'))
  const ctx = new Context()
  onTestFinished(async () => { await ctx.fiber.dispose(); await rm(root, { recursive: true, force: true }) })
  await ctx.plugin(Jsonl, { root, compression: 'none' })
  const persistence = ctx.sessionPersistence
  const id = SessionId('recycled')
  const other = SessionId('kept')
  const handle = await persistence.create({ id, version: SESSION_FORMAT_VERSION, createdAt: 1, isSeeded: false })
  await handle.append(oneTurnLog())
  await expect(persistence.purge(id)).rejects.toThrow('Close the Session')
  await handle.close()
  const kept = await persistence.create({ id: other, version: SESSION_FORMAT_VERSION, createdAt: 2, isSeeded: false })
  await kept.append(oneTurnLog())
  await kept.close()
  await persistence.purge(id)
  expect(await persistence.stat(id)).toBeUndefined()
  await expect(persistence.purge(id)).resolves.toBeUndefined()
  expect(await persistence.stat(other)).toBeDefined()
})
