/** Browser icons use the same rounded artwork as the Windows app. */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import sharp from 'sharp'
import { expect, it } from 'vitest'
import { ICON_OUTPUT_DIRECTORY, TILE_SOURCE, renderAppIcons, renderProductBrandStyles } from '../scripts/render-app-icons.ts'

it('ships reproducible icon sizes with transparent ordinary corners and opaque maskable corners', async () => {
  const icons = await renderAppIcons(await readFile(TILE_SOURCE))
  for (const { variant, png } of icons) {
    expect((await readFile(join(ICON_OUTPUT_DIRECTORY, variant.file))).equals(png)).toBe(true)
    const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    expect([info.width, info.height]).toEqual([variant.size, variant.size])
    const corners = [0, info.width - 1, (info.height - 1) * info.width, info.width * info.height - 1]
    for (const index of corners) expect(data[index * info.channels + 3]).toBe(variant.kind === 'maskable' ? 255 : 0)
  }
})

it('rejects unreadable source artwork', async () => {
  await expect(renderAppIcons(Buffer.from('not an image'))).rejects.toThrow()
})

it('embeds reproducible offline artwork in shared primitive styles', async () => {
  const css = await renderProductBrandStyles(await readFile(TILE_SOURCE))
  expect(await readFile(new URL('../../../packages/client/ui-primitives/src/ProductBrand.module.css', import.meta.url), 'utf8')).toBe(css)
  expect(css).toContain('data:image/png;base64,')
})
