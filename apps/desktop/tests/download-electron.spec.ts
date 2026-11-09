import { downloadArtifact, HTTPError } from '@electron/get'
import { afterEach, expect, it, vi } from 'vitest'
import { downloadDesktopElectron } from '../scripts/download-electron.ts'

vi.mock('@electron/get', async importOriginal => ({
  ...await importOriginal<typeof import('@electron/get')>(),
  downloadArtifact: vi.fn(),
}))
vi.mock('node:timers/promises', () => ({ setTimeout: async () => undefined }))

const filename = 'electron-v44.7.0-win32-x64.zip'
const options = { version: '44.7.0', platform: 'win32', arch: 'x64', artifactName: 'electron', checksums: { [filename]: 'a'.repeat(64) } }

afterEach(() => {
  vi.resetAllMocks()
  vi.restoreAllMocks()
})

it('retries a gateway timeout against the same pinned release', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  vi.mocked(downloadArtifact).mockRejectedValueOnce(new HTTPError(new Response(null, { status: 504 }))).mockResolvedValueOnce('archive.zip')
  await expect(downloadDesktopElectron(options)).resolves.toBe('archive.zip')
  expect(vi.mocked(downloadArtifact).mock.calls).toEqual([[options], [options]])
})

it('reports repeated gateway failures after three attempts', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
  const failure = new HTTPError(new Response(null, { status: 504 }))
  vi.mocked(downloadArtifact).mockRejectedValue(failure)
  await expect(downloadDesktopElectron(options)).rejects.toBe(failure)
  expect(downloadArtifact).toHaveBeenCalledTimes(3)
  const fallback = vi.mocked(downloadArtifact).mock.calls[2]?.[0]
  expect(fallback?.checksums).toEqual(options.checksums)
  await expect(fallback?.mirrorOptions?.resolveAssetURL?.(fallback)).resolves.toBe(
    'https://cdn.npmmirror.com/binaries/electron/v44.7.0/' + filename,
  )
})

it('reports checksum failures without retrying', async () => {
  const failure = new Error('checksum mismatch')
  vi.mocked(downloadArtifact).mockRejectedValue(failure)
  await expect(downloadDesktopElectron(options)).rejects.toBe(failure)
  expect(downloadArtifact).toHaveBeenCalledTimes(1)
})

it('refuses a release without the target checksum', async () => {
  await expect(downloadDesktopElectron({ ...options, checksums: {} })).rejects.toThrow('missing SHA-256')
  expect(downloadArtifact).not.toHaveBeenCalled()
})
