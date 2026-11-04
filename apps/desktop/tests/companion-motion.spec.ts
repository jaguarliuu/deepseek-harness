import { expect, it } from 'vitest'
import { CompanionChoreography, type CompanionMotionInput } from '../src/companion-motion.ts'

const base: CompanionMotionInput = {
  now: 0, active: true, busy: false, roaming: true, reduced: false, nearby: false,
  x: 800, minX: 0, maxX: 1000,
}
it('greets on startup, walks in short bursts, then rests', () => {
  const motion = new CompanionChoreography(0)
  expect(motion.tick(base)).toBe(0)
  expect(motion.view().pose).toBe('wave')
  expect(motion.tick({ ...base, now: 6100 })).toBeLessThan(0)
  expect(motion.view()).toEqual({ pose: 'walk', since: 6100, direction: -1 })
  expect(motion.tick({ ...base, now: 12000 })).toBe(0)
  expect(motion.view().pose).toBe('idle')
})
it.each([{ nearby: true }, { active: false }, { reduced: true }, { roaming: false }])('stops movement when %j', (patch) => {
  const motion = new CompanionChoreography(0)
  motion.tick({ ...base, now: 6100 })
  expect(motion.tick({ ...base, now: 6150, ...patch })).toBe(0)
  expect(motion.view().pose).not.toBe('walk')
})
it('shows work only while a real task is active, then returns to idle without a success claim', () => {
  const motion = new CompanionChoreography(0)
  motion.tick({ ...base, now: 6100 })
  expect(motion.tick({ ...base, now: 6200, busy: true })).toBe(0)
  expect(motion.view().pose).toBe('work')
  motion.tick({ ...base, now: 6300 })
  expect(motion.view().pose).toBe('idle')
})
it('clamps at screen edges and caps time jumps after sleep', () => {
  const motion = new CompanionChoreography(0)
  expect(Math.abs(motion.tick({ ...base, now: 6100 }))).toBeCloseTo(3.6)
  expect(motion.tick({ ...base, now: 6140, x: 0.5 })).toBe(-0.5)
  expect(motion.view().pose).toBe('idle')
})
it('responds to a greeting without moving and honours reduced motion', () => {
  const motion = new CompanionChoreography(0)
  motion.greet(10000)
  expect(motion.tick({ ...base, now: 10010 })).toBe(0)
  expect(motion.view().pose).toBe('wave')
  motion.tick({ ...base, now: 10020, reduced: true })
  expect(motion.view().pose).toBe('idle')
})

it('reacts to repeated head strokes and then returns to ordinary activity', () => {
  const motion = new CompanionChoreography(0)
  motion.pet(1000)
  motion.pet(1800)
  motion.pet(2600)
  expect(motion.tick({ ...base, now: 2600 })).toBe(0)
  expect(motion.view()).toMatchSnapshot()
  motion.tick({ ...base, now: 5100 })
  expect(motion.view().pose).toBe('idle')
})
it('sleeps after inactivity and wakes on interaction or actual work', () => {
  const motion = new CompanionChoreography(0)
  expect(motion.tick({ ...base, now: 90000 })).toBe(0)
  expect(motion.view()).toMatchSnapshot()
  motion.wake(90100)
  motion.tick({ ...base, now: 90100 })
  expect(motion.view().pose).not.toBe('sleep')
  motion.tick({ ...base, now: 180100, busy: true })
  expect(motion.view().pose).toBe('work')
  motion.tick({ ...base, now: 180200 })
  expect(motion.view().pose).not.toBe('sleep')
})
it('suppresses playful reactions during work and reduced motion', () => {
  const motion = new CompanionChoreography(0)
  for (const now of [1000, 1800, 2600]) motion.pet(now)
  motion.tick({ ...base, now: 2700, busy: true })
  expect(motion.view().pose).toBe('work')
  for (const now of [3000, 3800, 4600]) motion.pet(now)
  motion.tick({ ...base, now: 4700, reduced: true })
  expect(motion.view().pose).toBe('idle')
  motion.tick({ ...base, now: 95000, reduced: true })
  expect(motion.view().pose).toBe('idle')
})
it('does not accumulate isolated head strokes into a repeated-stroke reaction', () => {
  const motion = new CompanionChoreography(0)
  for (const now of [1000, 6000, 11000]) motion.pet(now)
  motion.tick({ ...base, now: 11000 })
  expect(motion.view().pose).toBe('pet')
})

it('lands gently, reacts to a fast drag, adjusts the helmet and resumes idle', () => {
  const motion = new CompanionChoreography(0)
  motion.lift(3000)
  motion.tick({ ...base, now: 3100 })
  expect(motion.view().pose).toBe('lift')
  motion.drop(3200, true)
  const poses = [3200, 3700, 4800, 5800].map((now) => {
    expect(motion.tick({ ...base, now, roaming: false })).toBe(0)
    return motion.view().pose
  })
  expect(poses).toMatchInlineSnapshot(`
    [
      "land",
      "dizzy",
      "adjust",
      "idle",
    ]
  `)
  motion.lift(6000)
  motion.drop(6100, false)
  motion.tick({ ...base, now: 6600 })
  expect(motion.view().pose).toBe('adjust')
})
it('protects the helmet after repeated taps and clears playful reactions for work', () => {
  const motion = new CompanionChoreography(0)
  motion.tapHat(3000)
  motion.tick({ ...base, now: 3000 })
  expect(motion.view().pose).toBe('adjust')
  motion.tapHat(3700)
  motion.tapHat(4400)
  motion.tick({ ...base, now: 4400 })
  expect(motion.view().pose).toBe('guard')
  motion.tick({ ...base, now: 4500, busy: true })
  expect(motion.view().pose).toBe('work')
})
it('celebrates only explicit completion and suppresses all new reactions under reduced motion', () => {
  const motion = new CompanionChoreography(0)
  motion.tick({ ...base, now: 3000, busy: true })
  motion.tick({ ...base, now: 3100 })
  expect(motion.view().pose).not.toBe('celebrate')
  motion.complete(3200)
  motion.tick({ ...base, now: 3200 })
  expect(motion.view().pose).toBe('celebrate')
  motion.lift(3300)
  motion.tick({ ...base, now: 3300, reduced: true })
  expect(motion.view().pose).toBe('idle')
  motion.tick({ ...base, now: 3400 })
  expect(motion.view().pose).toBe('idle')
})
