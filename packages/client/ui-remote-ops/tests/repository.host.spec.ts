/** Local credential persistence and metadata redaction through the existing provider. */
import { mkdtemp, rm, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { generateKeyPairSync } from 'node:crypto'
import { Context } from '@deepseek-ai/cordis'
import { LocalCredentialProvider } from '@deepseek-ai/dsh-credentials-local'
import { expect, it, onTestFinished } from 'vitest'
import { ServerRepository } from '../src/repository.ts'
import type { ServerInput } from '../src/types.ts'
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'xiaoc-ssh-credentials-'))
  const ctx = new Context()
  onTestFinished(async () => {
    await ctx.fiber.dispose()
    await rm(dir, { recursive: true, force: true })
  })
  await ctx.plugin(LocalCredentialProvider, { path: join(dir, 'credentials.yaml'), watch: false })
  const repository = new ServerRepository(ctx)
  const input: ServerInput = {
    name: 'Internal test',
    group: 'Operations',
    host: 'localhost',
    port: 22,
    username: 'employee',
    auth: 'password',
    secret: 'private-local-password',
    passphrase: '',
    fingerprint: `SHA256:${'A'.repeat(43)}`,
  }
  return { repository, input, dir, ctx }
}
it('persists secrets locally while metadata, edits and deletion remain credential-safe', async () => {
  const { repository, input, dir, ctx } = await fixture()
  const saved = await repository.save(input)
  expect(JSON.stringify(await repository.list())).not.toContain(input.secret)
  expect(saved).not.toHaveProperty('secret')
  expect(await readFile(join(dir, 'credentials.yaml'), 'utf8')).toContain(input.secret)
  await repository.save({ ...input, id: saved.id, name: 'Renamed', secret: '' })
  expect((await repository.get(saved.id)).secret).toBe(input.secret)
  await expect(repository.save({ ...input, id: saved.id, host: 'another-server', secret: '' })).rejects.toThrow(
    'invalidInput',
  )
  const anotherReader = new ServerRepository(ctx)
  expect(await anotherReader.list()).toEqual([{ ...saved, name: 'Renamed' }])
  await repository.remove(saved.id)
  expect(await repository.list()).toEqual([])
  expect(await readFile(join(dir, 'credentials.yaml'), 'utf8')).not.toContain(input.secret)
})
it('requires explicit host identity and rejects malformed connection fields', async () => {
  const { repository, input } = await fixture()
  await expect(repository.save({ ...input, fingerprint: '' })).rejects.toThrow('invalidInput')
  await expect(repository.save({ ...input, host: 'user@host' })).rejects.toThrow('invalidInput')
  await expect(repository.save({ ...input, port: 0 })).rejects.toThrow('invalidInput')
  expect(await repository.list()).toEqual([])
})

it('validates a selected private key before persisting it and rejects public keys', async () => {
  const { repository, input } = await fixture()
  await expect(repository.save({ ...input, auth: 'key', secret: 'invalid-key-file' })).rejects.toThrow('invalidKeyFile')
  const pair = generateKeyPairSync('rsa', { modulusLength: 2048 })
  await expect(
    repository.save({
      ...input,
      auth: 'key',
      secret: pair.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    }),
  ).rejects.toThrow('invalidKeyFile')
  const saved = await repository.save({
    ...input,
    auth: 'key',
    secret: pair.privateKey.export({ type: 'pkcs1', format: 'pem' }).toString(),
  })
  expect(saved.auth).toBe('key')
  expect(saved).not.toHaveProperty('secret')
})
