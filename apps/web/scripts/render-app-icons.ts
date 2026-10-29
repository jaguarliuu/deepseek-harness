/** Generate browser install icons from the rounded desktop product artwork. */
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

/** Rounded product artwork shared with Windows. */
export const TILE_SOURCE = fileURLToPath(new URL('../../desktop/resources/icon-windows.png', import.meta.url))
/** Directory containing committed browser icon resources. */
export const ICON_OUTPUT_DIRECTORY = fileURLToPath(new URL('../public/', import.meta.url))
/** Scale that keeps the entire square artwork inside the platform's circular safe zone. */
export const MASKABLE_ARTWORK_SCALE = 0.56
/** Guaranteed maskable radius, measured relative to the icon edge. */
export const MASKABLE_SAFE_RADIUS_RATIO = 0.4

/** One browser icon output. */
export interface AppIconVariant {
  readonly file: string
  readonly size: number
  readonly kind: 'tile' | 'maskable'
}

/** Install and favicon resources referenced by the browser shell. */
export const APP_ICON_VARIANTS: readonly AppIconVariant[] = [
  { file: 'icon-192.png', size: 192, kind: 'tile' },
  { file: 'icon-512.png', size: 512, kind: 'tile' },
  { file: 'icon-maskable-512.png', size: 512, kind: 'maskable' },
  { file: 'apple-touch-icon.png', size: 180, kind: 'tile' },
  { file: 'favicon.png', size: 64, kind: 'tile' },
]

/**
 * Render install icons while preserving rounded transparency outside maskable outputs.
 * @param source - Product PNG bytes.
 * @returns PNG bytes and their output descriptors.
 */
export async function renderAppIcons(source: Buffer): Promise<readonly { variant: AppIconVariant; png: Buffer }[]> {
  return Promise.all(APP_ICON_VARIANTS.map(async (variant) => {
    const edge = variant.kind === 'maskable' ? Math.round(variant.size * MASKABLE_ARTWORK_SCALE) : variant.size
    const artwork = await sharp(source).resize(edge, edge).png().toBuffer()
    const png = variant.kind === 'maskable'
      ? await sharp({ create: { width: variant.size, height: variant.size, channels: 4, background: '#ffffff' } })
        .composite([{ input: artwork, gravity: 'centre' }]).png().toBuffer()
      : artwork
    return { variant, png }
  }))
}

/**
 * Embed the small mark in shared primitive CSS, which is linked into multiple plugin bundles.
 * @param source - Rounded product PNG bytes.
 * @returns Stylesheet with a self-contained 64-pixel mark.
 */
export async function renderProductBrandStyles(source: Buffer): Promise<string> {
  const png = await sharp(source).resize(64, 64).png().toBuffer()
  return `.mark {
  display: inline-block;
  flex: none;
  background: url('data:image/png;base64,${png.toString('base64')}') center / contain no-repeat;
}

.wordmark {
  display: inline-flex;
  align-items: center;
  gap: 0.35em;
  color: var(--dsw-alias-brand-text);
  font-family: var(--dsw-font-family);
  font-weight: 500;
  white-space: nowrap;
}
`
}

async function main(): Promise<void> {
  const source = await readFile(TILE_SOURCE)
  const icons = await renderAppIcons(source)
  await writeFile(new URL('../../../packages/client/ui-primitives/src/ProductBrand.module.css', import.meta.url), await renderProductBrandStyles(source))
  await Promise.all(icons.map(async ({ variant, png }) => writeFile(resolve(ICON_OUTPUT_DIRECTORY, variant.file), png)))
  console.info(`app icons: wrote ${icons.map(icon => icon.variant.file).join(', ')}`)
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) await main()
