import { afterEach, expect, it, vi } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { DesktopTaskResultBubble } from '../src/task-result-bubble.ts'
import { TASK_RESULT_IPC } from '../src/task-result-api.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

interface FakeWindow {
  visible: boolean
  webContents: { mainFrame: { url: string } }
}
const native = vi.hoisted(() => ({ windows: [] as FakeWindow[], handlers: new Map<string, (...args: unknown[]) => unknown>() }))
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events')
  class Window {
    visible = false
    destroyed = false
    bounds = { x: 0, y: 0, width: 300, height: 106 }
    webContents = Object.assign(new EventEmitter(), {
      mainFrame: { url: 'dsh-app://shell/task-result.html' }, setWindowOpenHandler: vi.fn(), send: vi.fn(),
    })
    constructor() { native.windows.push(this) }
    loadURL = vi.fn(async () => {})
    isDestroyed() { return this.destroyed }
    showInactive() { this.visible = true }
    hide() { this.visible = false }
    destroy() { this.destroyed = true }
    getBounds() { return this.bounds }
    setPosition(x: number, y: number) { Object.assign(this.bounds, { x, y }) }
  }
  return { BrowserWindow: Window, ipcMain: {
    handle: (name: string, handler: (...args: unknown[]) => unknown) => native.handlers.set(name, handler),
    removeHandler: (name: string) => native.handlers.delete(name),
  }, screen: { getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }) } }
})
let bubble: DesktopTaskResultBubble | undefined
afterEach(() => { bubble?.dispose(); native.windows.length = 0; native.handlers.clear(); vi.useRealTimers() })
function setup() {
  vi.useFakeTimers()
  const open = vi.fn()
  const enabled = vi.fn(() => true)
  bubble = new DesktopTaskResultBubble({ appPath: '/app', locale: () => resolveDesktopLocale('zh'),
    anchor: () => ({ x: 1376, y: 500, width: 64, height: 72 }), enabled, open })
  const result = { sessionId: SessionId('session-result'), turn: 1, outcome: 'completed' as const }
  return { open, enabled, result }
}
function sender() {
  const window = native.windows[0]!
  return { sender: window.webContents, senderFrame: window.webContents.mainFrame }
}
it('shows localized completion without focus and opens exactly the originating session', async () => {
  const f = setup()
  bubble!.notify(f.result)
  await vi.advanceTimersByTimeAsync(0)
  expect(native.windows[0]!.visible).toBe(true)
  const view = native.handlers.get(TASK_RESULT_IPC.view)!(sender())
  expect(view).toMatchSnapshot()
  native.handlers.get(TASK_RESULT_IPC.action)!(sender(), 'open', 1)
  expect(f.open).toHaveBeenCalledWith(f.result)
  expect(native.windows[0]!.visible).toBe(false)
  bubble!.notify(f.result)
  expect(bubble!.isVisible()).toBe(false)
})
it('expires, distinguishes failure, and rejects stale clicks and other frames', async () => {
  const f = setup()
  bubble!.notify(f.result)
  bubble!.notify({ ...f.result, turn: 2, outcome: 'error' })
  await vi.advanceTimersByTimeAsync(12000)
  expect(native.handlers.get(TASK_RESULT_IPC.view)!(sender())).toMatchSnapshot()
  const action = native.handlers.get(TASK_RESULT_IPC.action)!
  action(sender(), 'open', 1)
  expect(f.open).not.toHaveBeenCalled()
  expect(() => action({}, 'open', 2)).toThrow('Untrusted')
  action(sender(), 'close', 2)
  expect(bubble!.isVisible()).toBe(false)
  await vi.advanceTimersByTimeAsync(20000)
  expect(native.windows[0]!.visible).toBe(false)
})
it('suppresses notifications when disabled and closes when disabled later', async () => {
  const f = setup()
  f.enabled.mockReturnValue(false)
  bubble!.notify(f.result)
  expect(native.windows).toHaveLength(0)
  f.enabled.mockReturnValue(true)
  bubble!.notify(f.result)
  await vi.advanceTimersByTimeAsync(0)
  f.enabled.mockReturnValue(false)
  await vi.advanceTimersByTimeAsync(300)
  expect(bubble!.isVisible()).toBe(false)
  expect(native.windows[0]!.visible).toBe(false)
})
