// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { afterEach, expect, it, vi } from 'vitest'

interface PointerPlay { refresh(): void; dispose(): void }
const source = readFileSync(resolve(import.meta.dirname, '../renderer/companion-pointer.js'), 'utf8')
let play: PointerPlay | undefined
function setup() {
  vi.useFakeTimers()
  vi.setSystemTime(0)
  const target = document.createElement('main')
  const character = document.createElement('div')
  target.append(character)
  document.body.append(target)
  character.getBoundingClientRect = () => ({
    x: 0, y: 0, left: 0, top: 0, right: 196, bottom: 240, width: 196, height: 240, toJSON: () => ({}),
  })
  const scope: {
    addEventListener: typeof window.addEventListener
    removeEventListener: typeof window.removeEventListener
    installXiaocPointerPlay?: (character: HTMLElement, target: HTMLElement, enabled: () => boolean) => PointerPlay
  } = { addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window) }
  runInNewContext(source, { window: scope, performance: { now: () => Date.now() }, setTimeout, clearTimeout })
  let enabled = true
  play = scope.installXiaocPointerPlay!(character, target, () => enabled)
  const move = (x: number, y = 120, buttons = 0) => target.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, buttons }))
  return { character, target, move, disable: () => { enabled = false; play!.refresh() } }
}
afterEach(() => { play?.dispose(); document.body.replaceChildren(); vi.useRealTimers() })
it('tracks the nearby pointer with bounded eye offsets and clears on leaving', () => {
  const f = setup()
  f.move(190)
  expect(f.character.classList.contains('pointer-play')).toBe(true)
  expect(f.character.style.getPropertyValue('--look-x')).toBe('2.82px')
  f.move(-1000)
  expect(f.character.style.getPropertyValue('--look-x')).toBe('-3.00px')
  f.target.dispatchEvent(new Event('pointerleave'))
  expect(f.character.classList.contains('pointer-play')).toBe(false)
})
it('leans back after dwelling at the face, then observes a cooldown', () => {
  const f = setup()
  f.move(98, 70)
  vi.advanceTimersByTime(649)
  expect(f.character.classList.contains('pointer-shy')).toBe(false)
  vi.advanceTimersByTime(1)
  expect(f.character.classList.contains('pointer-shy')).toBe(true)
  vi.advanceTimersByTime(1000)
  f.move(98, 70)
  vi.advanceTimersByTime(650)
  expect(f.character.classList.contains('pointer-shy')).toBe(false)
})
it('tilts after repeated changes of direction without sending any task command', () => {
  const f = setup()
  for (const x of [40, 150, 40, 150, 40]) f.move(x)
  expect(f.character.className).toMatchInlineSnapshot('"pointer-play pointer-curious"')
  vi.advanceTimersByTime(900)
  expect(f.character.className).toBe('pointer-play')
})
it('cancels dwell for dragging, busy or reduced presentation, blur and disposal', () => {
  const f = setup()
  f.move(98, 70)
  f.move(99, 70, 1)
  vi.advanceTimersByTime(700)
  expect(f.character.className).toBe('')
  f.move(98, 70)
  f.disable()
  vi.advanceTimersByTime(700)
  expect(f.character.className).toBe('')
  f.move(98, 70)
  expect(f.character.className).toBe('')
  play!.dispose()
  f.move(140)
  expect(f.character.className).toBe('')
})
it('cancels a pending face reaction when the pointer or focus leaves', () => {
  const f = setup()
  f.move(98, 70)
  f.move(150, 160)
  vi.advanceTimersByTime(700)
  expect(f.character.classList.contains('pointer-shy')).toBe(false)
  f.move(98, 70)
  window.dispatchEvent(new Event('blur'))
  vi.advanceTimersByTime(700)
  expect(f.character.className).toBe('')
})
