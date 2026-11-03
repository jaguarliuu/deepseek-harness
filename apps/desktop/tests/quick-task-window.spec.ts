import type { BrowserWindow } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { DesktopQuickTask, quickTaskBounds } from '../src/quick-task-window.ts'
import { QUICK_TASK_IPC } from '../src/quick-task-api.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

const native = vi.hoisted(() => ({ handlers: new Map<string, (event: unknown, action?: unknown) => unknown>() }))
vi.mock('electron', () => ({
  ipcMain: {
    handle: (name: string, fn: (event: unknown, action?: unknown) => unknown) => native.handlers.set(name, fn),
    removeHandler: (name: string) => native.handlers.delete(name),
  },
  screen: {
    getPrimaryDisplay: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
    getDisplayMatching: () => ({ workArea: { x: 0, y: 0, width: 1440, height: 900 } }),
  },
}))
let owner: DesktopQuickTask | undefined
afterEach(() => { owner?.dispose(); native.handlers.clear() })
function setup() {
  const bounds = { x: 40, y: 40, width: 1200, height: 800 }
  const window = {
    isDestroyed: () => false, isVisible: () => true, isFullScreen: () => false, isMaximized: () => false,
    isAlwaysOnTop: () => false, getMinimumSize: () => [520, 600], getNormalBounds: () => bounds,
    setMinimumSize: vi.fn(), setBounds: vi.fn(), setAlwaysOnTop: vi.fn(), isMinimized: () => false,
    show: vi.fn(), hide: vi.fn(), focus: vi.fn(), unmaximize: vi.fn(), maximize: vi.fn(),
    webContents: { send: vi.fn() },
  }
  const webContents: Partial<BrowserWindow['webContents']> = window.webContents
  const nativeWindow: Partial<BrowserWindow> = { ...window, getMinimumSize: () => [520, 600], webContents: webContents as BrowserWindow['webContents'] }
  const sender = {}
  owner = new DesktopQuickTask({ window: () => nativeWindow as BrowserWindow,
    anchor: () => ({ x: 1200, y: 570, width: 220, height: 310 }), locale: () => resolveDesktopLocale('zh'),
    assertSender: (event) => { if (event !== sender) throw new Error('unowned'); return nativeWindow as BrowserWindow },
  })
  const action = (value: string) => native.handlers.get(QUICK_TASK_IPC.action)!(sender, value)
  return { window, bounds, sender, action }
}
it('fits beside the character on secondary and small screens', () => {
  const area = { x: -800, y: 100, width: 800, height: 600 }
  expect(quickTaskBounds(area, { x: -790, y: 450, width: 220, height: 310 })).toEqual({ x: -558, y: 100, width: 480, height: 600 })
})
it('preserves the original workspace geometry across repeated openings', () => {
  const f = setup()
  owner!.show()
  owner!.show()
  expect(f.window.setBounds).toHaveBeenLastCalledWith({ x: 788, y: 390, width: 400, height: 360 })
  expect(f.window.webContents.send).toHaveBeenCalledWith(QUICK_TASK_IPC.command, 'open')
  owner!.restore()
  expect(f.window.setBounds).toHaveBeenLastCalledWith(f.bounds)
  expect(f.window.setMinimumSize).toHaveBeenLastCalledWith(520, 600)
  expect(f.window.setAlwaysOnTop).toHaveBeenLastCalledWith(false)
})
it('hides without cancelling work and routes explicit new-task commands to the existing client', () => {
  const f = setup()
  owner!.show()
  f.action('new')
  expect(f.window.webContents.send).toHaveBeenCalledWith(QUICK_TASK_IPC.command, 'new')
  f.action('hide')
  expect(f.window.hide).toHaveBeenCalledOnce()
  f.action('expand')
  expect(f.window.setBounds).toHaveBeenLastCalledWith(f.bounds)
  expect(native.handlers.get(QUICK_TASK_IPC.status)!(f.sender)).toMatchSnapshot()
})
it('rejects other renderers and unsupported actions, and removes IPC on disposal', () => {
  const f = setup()
  expect(() => native.handlers.get(QUICK_TASK_IPC.action)!({}, 'new')).toThrow('unowned')
  expect(() => f.action('execute')).toThrow('Unsupported')
  owner!.dispose()
  owner!.show()
  expect(native.handlers.size).toBe(0)
  expect(f.window.show).not.toHaveBeenCalled()
})

it('shows the compact window before forwarding selected text as a draft command', () => {
  const f = setup()
  owner!.openSelection('selected text')
  expect(f.window.show).toHaveBeenCalledOnce()
  expect(f.window.webContents.send).toHaveBeenLastCalledWith(QUICK_TASK_IPC.command, { selectionText: 'selected text' })
})

it('expands for history, shrinks for an empty conversation, and leaves expanded workspace geometry alone', () => {
  const f = setup()
  const phase = native.handlers.get(QUICK_TASK_IPC.phase)!
  owner!.show()
  phase(f.sender, 'active')
  expect(f.window.setBounds).toHaveBeenLastCalledWith({ x: 40, y: 40, width: 480, height: 660 })
  phase(f.sender, 'hero')
  expect(f.window.setBounds).toHaveBeenLastCalledWith({ x: 40, y: 40, width: 400, height: 360 })
  owner!.restore()
  f.window.setBounds.mockClear()
  phase(f.sender, 'active')
  expect(f.window.setBounds).not.toHaveBeenCalled()
  expect(() => phase({}, 'hero')).toThrow('unowned')
  expect(() => phase(f.sender, 'invalid')).toThrow('Unsupported')
})
