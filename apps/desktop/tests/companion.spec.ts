import { afterEach, expect, it, vi } from 'vitest'
import { DesktopCompanion } from '../src/companion.ts'
import { COMPANION_IPC, type CompanionView } from '../src/companion-api.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

interface WindowState {
  emit(event: string): boolean
  destroyed: boolean
  bounds: { x: number; y: number; width: number; height: number }
  webContents: { mainFrame: { url: string } }
}
type Handler = (event: unknown, value?: unknown) => unknown
const native = vi.hoisted(() => ({
  cursor: { x: 0, y: 0 },
  windows: [] as WindowState[],
  handlers: new Map<string, Handler>(),
  area: { x: 0, y: 0, width: 1440, height: 900 },
}))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Window extends EventEmitter {
    visible = false
    destroyed = false
    bounds = { x: 0, y: 0, width: 220, height: 256 }
    webContents = Object.assign(new EventEmitter(), { mainFrame: { url: 'dsh-app://shell/companion.html' }, setWindowOpenHandler: vi.fn(), send: vi.fn() })
    constructor() { super(); native.windows.push(this) }
    loadURL = vi.fn(async () => {})
    isDestroyed() { return this.destroyed }
    isVisible() { return this.visible }
    showInactive() { this.visible = true; this.emit('show') }
    hide() { this.visible = false; this.emit('hide') }
    destroy() { this.destroyed = true; this.emit('closed') }
    setPosition(x: number, y: number) { Object.assign(this.bounds, { x, y }) }
    getBounds() { return this.bounds }
    setBounds(bounds: typeof this.bounds) { this.bounds = bounds }
  }
  return {
    BrowserWindow: Window,
    ipcMain: {
      handle: (key: string, fn: Handler) => native.handlers.set(key, fn),
      removeHandler: (key: string) => native.handlers.delete(key),
    },
    screen: Object.assign(new EventEmitter(), {
      getCursorScreenPoint: () => native.cursor,
      getPrimaryDisplay: () => ({ workArea: native.area }), getDisplayMatching: () => ({ workArea: native.area }),
    }),
  }
})
let companion: DesktopCompanion | undefined
function setup(inspect = vi.fn(async () => ({ activeTasks: false, scheduledTasks: true }))) {
  vi.useFakeTimers()
  vi.setSystemTime(new Date(0))
  const open = vi.fn()
  companion = new DesktopCompanion({ appPath: '/app', locale: () => resolveDesktopLocale('zh'), open, inspect })
  companion.show()
  const window = native.windows[0]!
  const sender = { sender: window.webContents, senderFrame: window.webContents.mainFrame }
  const view = () => native.handlers.get(COMPANION_IPC.view)!(sender) as CompanionView
  const action = (value: string) => native.handlers.get(COMPANION_IPC.action)!(sender, value)
  return { window, view, action, open, inspect, sender }
}
afterEach(() => {
  native.cursor = { x: 0, y: 0 }; companion?.dispose(); native.windows.length = 0; native.handlers.clear(); vi.useRealTimers()
})

it('reports real active work without treating armed schedules as running work', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  expect(f.view()).toMatchObject({ state: 'idle', collapsed: false, messages: { companionIdle: '随时待命' } })
  f.inspect.mockResolvedValue({ activeTasks: true, scheduledTasks: false })
  await vi.advanceTimersByTimeAsync(3000)
  expect(f.view().state).toBe('busy')
  expect(f.view()).toMatchSnapshot()
})
it('shows unknown after a failed inspection, recovers, and pauses while hidden', async () => {
  const f = setup(vi.fn().mockRejectedValue(new Error('Host offline')))
  await vi.advanceTimersByTimeAsync(0)
  expect(f.view().state).toBe('unknown')
  f.action('hide')
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.inspect).toHaveBeenCalledOnce()
  f.inspect.mockResolvedValue({ activeTasks: false, scheduledTasks: false })
  companion!.show()
  await vi.advanceTimersByTimeAsync(0)
  expect(f.view().state).toBe('idle')
  expect(native.windows).toHaveLength(1)
})
it('keeps compact and expanded windows on screen and routes workspace action', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  f.action('collapse')
  expect(f.window.bounds.height).toBe(108)
  f.window.bounds.x = 9000
  f.action('collapse')
  expect(f.window.bounds).toMatchObject({ x: 1220, height: 256 })
  f.action('open')
  expect(f.open).toHaveBeenCalledOnce()
})
it('rejects foreign frames and unsupported commands', () => {
  const f = setup()
  const action = native.handlers.get(COMPANION_IPC.action)!
  expect(() => action({ sender: {}, senderFrame: {} }, 'open')).toThrow('Untrusted')
  expect(() => action({ sender: f.window.webContents, senderFrame: { url: 'dsh-app://shell/companion.html' } }, 'open')).toThrow('Untrusted')
  expect(() => f.action('delete')).toThrow('Unsupported')
  expect(f.open).not.toHaveBeenCalled()
})
it('does not overlap inspections or recreate resources after disposal', async () => {
  let resolve!: (value: { activeTasks: boolean; scheduledTasks: boolean }) => void
  const f = setup(vi.fn(() => new Promise((done) => { resolve = done })))
  await vi.advanceTimersByTimeAsync(0)
  companion!.show()
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.inspect).toHaveBeenCalledOnce()
  companion!.dispose()
  resolve({ activeTasks: true, scheduledTasks: false })
  await vi.advanceTimersByTimeAsync(10000)
  companion!.show()
  expect(f.window.destroyed).toBe(true)
  expect(native.handlers.size).toBe(0)
  expect(native.windows).toHaveLength(1)
})

it('moves the native window while roaming and stops after opting into stationary activity', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  f.action('reduce-off')
  const initialX = f.window.bounds.x
  await vi.advanceTimersByTimeAsync(10000)
  expect(f.window.bounds.x).toBeLessThan(initialX)
  expect(f.view().motion.pose).toBe('walk')
  f.action('roam')
  const stoppedX = f.window.bounds.x
  await vi.advanceTimersByTimeAsync(3000)
  expect(f.window.bounds.x).toBe(stoppedX)
  expect(f.view().roaming).toBe(false)
  f.action('greet')
  expect(f.view().motion.pose).toBe('wave')
})

it('drags from the character, clamps at the display edge, and stops after release', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  native.cursor = { x: 1300, y: 700 }
  const initial = { ...f.window.bounds }
  f.action('drag-start')
  native.cursor = { x: 1100, y: 600 }
  await vi.advanceTimersByTimeAsync(32)
  expect(f.window.bounds).toMatchObject({ x: initial.x - 200, y: initial.y - 100 })
  native.cursor = { x: -1000, y: -1000 }
  await vi.advanceTimersByTimeAsync(32)
  expect(f.window.bounds).toMatchObject({ x: 0, y: 0 })
  f.action('drag-end')
  native.cursor = { x: 900, y: 500 }
  await vi.advanceTimersByTimeAsync(32)
  expect(f.window.bounds).toMatchObject({ x: 0, y: 0 })
  expect(f.open).not.toHaveBeenCalled()
})

it.each(['left', 'right'] as const)('docks on the %s, reveals on hover, and detaches when dragged away', async (side) => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  native.cursor = { x: 1300, y: 700 }
  f.action('drag-start')
  native.cursor = { x: side === 'left' ? 0 : 1440, y: 700 }
  f.action('drag-end')
  expect(f.view()).toMatchObject({ dock: side, tucked: false })
  native.cursor = { x: 700, y: 100 }
  await vi.advanceTimersByTimeAsync(1400)
  expect(f.view().tucked).toBe(true)
  expect(f.window.bounds).toMatchObject({ width: 64, height: 72, x: side === 'left' ? 0 : 1376 })
  native.cursor = { x: f.window.bounds.x + 30, y: f.window.bounds.y + 30 }
  await vi.advanceTimersByTimeAsync(200)
  expect(f.view().tucked).toBe(false)
  expect(f.window.bounds.width).toBe(220)
  f.action('drag-start')
  native.cursor = { x: native.cursor.x + (side === 'left' ? 300 : -300), y: native.cursor.y }
  f.action('drag-end')
  expect(f.view()).toMatchObject({ dock: null, tucked: false })
  await vi.advanceTimersByTimeAsync(1400)
  expect(f.window.bounds.width).toBe(220)
})

it('docks after a native window drag as well as a renderer gesture', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  f.window.emit('will-move')
  f.window.bounds = { x: 1220, y: 400, width: 220, height: 256 }
  f.window.emit('moved')
  await vi.advanceTimersByTimeAsync(400)
  expect(f.view().dock).toBe('right')
  native.cursor = { x: 500, y: 100 }
  await vi.advanceTimersByTimeAsync(1400)
  expect(f.view().tucked).toBe(true)
})

it('keeps docking detection alive after a system hide notification, but stops on explicit hide', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  f.window.emit('will-move')
  f.window.bounds = { x: 1220, y: 400, width: 220, height: 256 }
  await vi.advanceTimersByTimeAsync(400)
  f.window.emit('hide')
  native.cursor = { x: 500, y: 100 }
  await vi.advanceTimersByTimeAsync(1400)
  expect(f.view().tucked).toBe(true)
  f.action('hide')
  native.cursor = { x: 1400, y: 420 }
  await vi.advanceTimersByTimeAsync(1400)
  expect(f.view().tucked).toBe(true)
})

it('keeps the full canvas until shrink animation finishes and ignores an obsolete completion', async () => {
  const f = setup()
  await vi.advanceTimersByTimeAsync(0)
  f.action('reduce-off')
  f.window.emit('will-move')
  f.window.bounds = { x: 1220, y: 400, width: 220, height: 256 }
  await vi.advanceTimersByTimeAsync(1800)
  expect(f.view().tucked).toBe(true)
  expect(f.window.bounds.width).toBe(220)
  const revision = f.view().dockRevision
  const settle = native.handlers.get(COMPANION_IPC.settled)!
  settle(f.sender, revision)
  expect(f.window.bounds.width).toBe(64)
  native.cursor = { x: 1400, y: 420 }
  await vi.advanceTimersByTimeAsync(80)
  expect(f.view().tucked).toBe(false)
  expect(f.window.bounds.width).toBe(220)
  native.cursor = { x: 500, y: 100 }
  await vi.advanceTimersByTimeAsync(1200)
  expect(f.view().tucked).toBe(true)
  settle(f.sender, revision)
  expect(f.window.bounds.width).toBe(220)
  settle(f.sender, f.view().dockRevision)
  expect(f.window.bounds.width).toBe(64)
  expect(() => settle({}, revision)).toThrow('Untrusted')
  expect(() => settle(f.sender, 'invalid')).toThrow('Invalid dock revision')
})
