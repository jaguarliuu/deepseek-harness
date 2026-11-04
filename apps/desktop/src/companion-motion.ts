/** Deterministic character choreography; movement has no effect on task state. */
export type CompanionPose = 'idle' | 'wave' | 'walk' | 'work' | 'shy' | 'sleep' | 'lift' | 'land' | 'dizzy' | 'adjust' | 'pet' | 'guard' | 'celebrate'
/** Renderer animation timeline and walking direction. */
export interface CompanionMotion {
  readonly pose: CompanionPose
  readonly since: number
  readonly direction: -1 | 1
}
/** One native-window observation; all distances use logical desktop pixels. */
export interface CompanionMotionInput {
  readonly now: number
  readonly active: boolean
  readonly busy: boolean
  readonly roaming: boolean
  readonly reduced: boolean
  readonly nearby: boolean
  readonly x: number
  readonly minX: number
  readonly maxX: number
}
/** Bounded walking bursts interleaved with greetings and idle gestures. */
export class CompanionChoreography {
  private pose: CompanionPose = 'idle'
  private since: number
  private previous: number
  private nextWalk: number
  private nextGreeting: number
  private waveUntil: number
  private walkUntil = 0
  private lastInteraction: number
  private petCount = 0
  private lastPet = -Infinity
  private shyUntil = 0
  private lifted = false
  private dropAt = -Infinity
  private dizzyDrop = false
  private petUntil = 0
  private hatUntil = 0
  private hatCount = 0
  private lastHat = -Infinity
  private completedUntil = 0
  private direction: -1 | 1 = -1

  /** @param now - Initial monotonic application timestamp in milliseconds. */
  constructor(now: number) {
    this.lastInteraction = now
    this.since = now
    this.previous = now
    this.nextWalk = now + 6000
    this.nextGreeting = now + 22000
    this.waveUntil = now + 2200
  }

  /** @param now - Start an explicit greeting without changing the reported task state. */
  greet(now: number): void { this.wake(now); this.waveUntil = now + 2400; this.walkUntil = 0; this.nextWalk = now + 8000 }

  /** @param now - Wake on direct interaction without claiming task progress. */
  wake(now: number): void { this.lastInteraction = now; this.nextWalk = now + 6000 }

  /** @param now - A completed head stroke; three strokes within four seconds trigger a shy reaction. */
  pet(now: number): void {
    this.wake(now)
    this.petCount = now - this.lastPet < 4000 ? this.petCount + 1 : 1
    this.lastPet = now
    this.walkUntil = 0
    if (this.petCount >= 3) { this.shyUntil = now + 2400; this.petCount = 0 }
    else this.petUntil = now + 1800
  }

  /** @param now - Explicit helmet tap; three taps within three seconds trigger protective hands. */
  tapHat(now: number): void {
    this.wake(now)
    this.hatCount = now - this.lastHat < 3000 ? this.hatCount + 1 : 1
    this.lastHat = now
    this.hatUntil = now + (this.hatCount >= 3 ? 2400 : 1000)
    this.walkUntil = 0
  }

  /** @param now - Time when actual pointer displacement begins, not a stationary press. */
  lift(now: number): void {
    if (this.lifted) return
    this.wake(now)
    this.lifted = true
    this.pose = 'lift'
    this.since = now
    this.walkUntil = 0
  }

  /** @param now - Pointer release time. @param fast - Whether measured pointer speed exceeded the playful threshold. */
  drop(now: number, fast: boolean): void {
    if (!this.lifted) return
    this.lifted = false
    this.dropAt = now
    this.dizzyDrop = fast
    this.wake(now)
  }

  /** @param now - Time of a real completed top-level turn; never inferred from becoming idle. */
  complete(now: number): void { this.completedUntil = now + 4000; this.wake(now) }

  /** @returns Current presentation; reading never advances the animation. */
  view(): CompanionMotion { return { pose: this.pose, since: this.since, direction: this.direction } }

  /**
   * Advance a bounded step; suspended timers never cause a large jump on resume.
   * @param input - Current cursor, work area, visibility, and task observations.
   * @returns Signed horizontal displacement; zero while blocked or stationary.
   */
  tick(input: CompanionMotionInput): number {
    const { now } = input
    const elapsed = Math.max(0, Math.min(now - this.previous, 80))
    this.previous = now
    let pose: CompanionPose = 'idle'
    let dx = 0
    if (!input.active || input.reduced) {
      this.walkUntil = 0
      this.waveUntil = 0
      this.shyUntil = 0
      this.petUntil = 0
      this.hatUntil = 0
      this.completedUntil = 0
      this.dropAt = -Infinity
      this.lifted = false
      this.lastInteraction = now
      this.nextWalk = now + 6000
    } else if (this.lifted) {
      pose = 'lift'
    } else if (now - this.dropAt < 450) {
      pose = 'land'
    } else if (this.dizzyDrop && now - this.dropAt < 1550) {
      pose = 'dizzy'
    } else if (now - this.dropAt < (this.dizzyDrop ? 2450 : 1350)) {
      pose = 'adjust'
    } else if (input.busy) {
      this.walkUntil = 0
      this.nextWalk = now + 6000
      this.lastInteraction = now
      this.shyUntil = 0
      this.petCount = 0
      this.hatUntil = 0
      this.petUntil = 0
      pose = 'work'
    } else if (now < this.completedUntil) {
      pose = 'celebrate'
    } else if (now < this.hatUntil) {
      pose = this.hatCount >= 3 ? 'guard' : 'adjust'
    } else if (now < this.shyUntil) {
      pose = 'shy'
    } else if (now < this.petUntil) {
      pose = 'pet'
    } else if (now - this.lastInteraction >= 90000) {
      this.walkUntil = 0
      pose = 'sleep'
    } else {
      if (input.nearby || !input.roaming) {
        this.walkUntil = 0
        this.nextWalk = now + 6000
      }
      if (now >= this.nextGreeting && now >= this.walkUntil) {
        this.waveUntil = now + 2200
        this.nextGreeting = now + 22000
      }
      if (now < this.waveUntil) pose = 'wave'
      else if (input.roaming && !input.nearby) {
        if (now >= this.nextWalk) {
          this.direction = input.x > (input.minX + input.maxX) / 2 ? -1 : 1
          this.walkUntil = now + 5500
          this.nextWalk = now + 16000
        }
        if (now < this.walkUntil) {
          pose = 'walk'
          dx = this.direction * elapsed * 0.045
          const clamped = Math.max(input.minX, Math.min(input.maxX, input.x + dx))
          if (clamped !== input.x + dx) { this.walkUntil = 0; pose = 'idle' }
          dx = clamped - input.x
        }
      }
    }
    if (pose !== this.pose) { this.pose = pose; this.since = now }
    return dx
  }
}
