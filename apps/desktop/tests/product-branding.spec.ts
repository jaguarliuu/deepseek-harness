/** Product resources remain consistent across native and browser entry points. */
import { readFile } from 'node:fs/promises'
import sharp from 'sharp'
import { expect, it } from 'vitest'

const root = new URL('../../../', import.meta.url)

it('ships the same rounded transparent robot at every full-size application entry point', async () => {
  const source = await readFile(new URL('apps/desktop/resources/icon-windows.png', root))
  for (const path of [
    'apps/desktop/resources/icon.png',
    'apps/desktop/resources/icon-macos.png',
    'apps/desktop/renderer/assets/welcome-brand.png',
    'packages/client/ui-brand-official/src/client/assets/app-icon.png',
  ]) expect((await readFile(new URL(path, root))).equals(source)).toBe(true)
  const { data, info } = await sharp(source).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  expect([info.width, info.height]).toEqual([1024, 1024])
  for (const pixel of [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]) {
    expect(data[pixel * info.channels + 3]).toBe(0)
  }
})

it('omits the former product name from application-facing locale dictionaries', async () => {
  for (const path of [
    'apps/desktop/src/locale.ts',
    'packages/client/ui-settings-models/src/client/locales.ts',
    'packages/client/ui-plugin-manager/src/client/locales.ts',
    'packages/client/ui-settings-account/src/client/locales.ts',
    'packages/client/ui-settings-account/src/client/locales/onboarding.ts',
    'packages/client/ui-sidebar-documentpreview/src/client/office/locales.ts',
    'apps/web/public/manifest.webmanifest',
  ]) expect(await readFile(new URL(path, root), 'utf8')).not.toMatch(/DeepSeek Harness/u)
})
