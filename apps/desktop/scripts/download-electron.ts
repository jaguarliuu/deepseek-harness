/** Download the pinned Electron archive, retrying transient upstream gateway failures. */
import { setTimeout } from 'node:timers/promises'
import { downloadArtifact, HTTPError, type ElectronPlatformArtifactDetailsWithDefaults } from '@electron/get'

type DesktopElectronDownloadOptions = ElectronPlatformArtifactDetailsWithDefaults & { checksums: Record<string, string> }

/** Download from the configured source twice at most, then use the checksum-verified mirror.
 * @param options - Exact release, target and cache settings passed to Electron's downloader.
 * @returns The path to the checksum-verified Electron archive.
 */
export async function downloadDesktopElectron(options: DesktopElectronDownloadOptions): Promise<string> {
  const filename = `electron-v${options.version}-${options.platform}-${options.arch}.zip`
  if (!/^[a-f0-9]{64}$/u.test(options.checksums[filename] ?? '')) throw new Error(`desktop runtime: missing SHA-256 for ${filename}`)
  const mirror = {
    ...options,
    mirrorOptions: { resolveAssetURL: async () => `https://cdn.npmmirror.com/binaries/electron/v${options.version}/${filename}` },
  }
  for (let attempt = 1; ; attempt++) {
    try {
      return await downloadArtifact(attempt === 3 ? mirror : options)
    } catch (error) {
      if (!(error instanceof HTTPError) || ![502, 503, 504].includes(error.response.status) || attempt === 3) throw error
      console.warn(`desktop runtime: Electron download returned HTTP ${String(error.response.status)} (attempt ${String(attempt)}/3); retrying`)
      await setTimeout(5_000 * attempt)
    }
  }
}
