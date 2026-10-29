/** Browser-level checks of the built product branding. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { chromium } from 'playwright'
import { APP_ICON_VARIANTS, MASKABLE_SAFE_RADIUS_RATIO } from '../scripts/render-app-icons.ts'

const DIST_ROOT = fileURLToPath(new URL('../dist', import.meta.url))

it('ships product metadata and browser-decodable rounded artwork', async () => {
  const index = await readFile(join(DIST_ROOT, 'index.html'), 'utf8')
  expect(index).toContain('<title>智维小 C</title>')
  expect(index).toContain('type="image/png" href="./favicon.png"')
  const manifest: unknown = JSON.parse(
    await readFile(join(DIST_ROOT, 'manifest.webmanifest'), 'utf8'))
  expect(manifest).toMatchObject({ name: '智维小 C', short_name: '智维小 C', theme_color: '#007f73' })
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    for (const variant of APP_ICON_VARIANTS) {
      const png = await readFile(join(DIST_ROOT, variant.file))
      const result = await page.evaluate(async ({ source }) => {
        const image = new Image()
        image.src = source
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
        let radius = 0
        for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
          const at = (y * canvas.width + x) * 4
          if (data[at + 3]! > 128 && data[at]! + data[at + 1]! + data[at + 2]! < 384) {
            radius = Math.max(radius, Math.hypot(x - canvas.width / 2, y - canvas.height / 2))
          }
        }
        return { width: canvas.width, height: canvas.height, alpha: data[3], radius }
      }, { source: `data:image/png;base64,${png.toString('base64')}` })
      expect([result.width, result.height]).toEqual([variant.size, variant.size])
      expect(result.alpha).toBe(variant.kind === 'maskable' ? 255 : 0)
      if (variant.kind === 'maskable') expect(result.radius).toBeLessThan(variant.size * MASKABLE_SAFE_RADIUS_RATIO)
    }
  } finally { await browser.close() }
})
