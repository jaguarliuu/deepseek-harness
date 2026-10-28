/** Brand actions, links and supporting copy remain readable in both palettes. */
import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { parseRules } from './stylesheet-scan.ts'

const rules = parseRules(readFileSync(new URL('../src/styles/design-platform.css', import.meta.url), 'utf8'))

it.each([false, true])('keeps text contrast at least 4.5:1 (dark=%s)', (dark) => {
  const palette = new Map(rules.filter(rule => rule.selectors.includes('body')).flatMap(rule => rule.declarations))
  if (dark) for (const rule of rules.filter(rule => rule.selectors.includes('body[data-ds-dark-theme]'))) {
    for (const [name, value] of rule.declarations) palette.set(name, value)
  }
  const luminance = (token: string): number => {
    let value = palette.get(token)!
    const visited = new Set<string>()
    while (value.startsWith('var(')) {
      if (visited.has(value)) throw new Error(`Cyclic color: ${token}`)
      visited.add(value)
      value = palette.get(value.slice(4, -1))!
    }
    const rgb = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(value)
    if (rgb === null) throw new Error(`Expected RGB for ${token}: ${value}`)
    const channels = rgb.slice(1).map((part) => {
      const channel = Number(part) / 255
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
    })
    return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722
  }
  for (const [foreground, background] of [
    ['label-primary-foreground', 'button-primary-fill'],
    ['label-primary-foreground', 'button-primary-hover'],
    ['link', 'bg-base'],
    ['link', 'bg-layer-1'],
    ['label-secondary', 'bg-layer-1'],
    ['label-tertiary', 'bg-base'],
    ['label-caption', 'bg-base'],
  ]) {
    const values = [foreground, background].map(role => luminance(`--dsw-alias-${role}`)).sort((a, b) => a - b)
    expect((values[1]! + 0.05) / (values[0]! + 0.05), `${foreground} on ${background}`).toBeGreaterThanOrEqual(4.5)
  }
})
