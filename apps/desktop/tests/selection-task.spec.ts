import { afterEach, expect, it, vi } from 'vitest'
import { DesktopSelectionTask } from '../src/selection-task.ts'
import { zh } from '../src/locale.ts'

const native = vi.hoisted(() => ({
  register: vi.fn(() => true), unregister: vi.fn(), trusted: vi.fn(() => true),
  message: vi.fn(async (_options: import('electron').MessageBoxOptions) => ({ response: 0 })), read: vi.fn(async () => 'copied'),
  start: vi.fn(() => true), stop: vi.fn(), cleanup: vi.fn(),
  selection: vi.fn<() => { text: string } | null>(() => ({ text: 'selected text' })),
}))
vi.mock('electron', () => ({
  globalShortcut: { register: native.register, unregister: native.unregister },
  dialog: { showMessageBox: native.message }, clipboard: { readText: native.read },
  systemPreferences: { isTrustedAccessibilityClient: native.trusted },
}))
vi.mock('selection-hook', () => ({ default: class {
  on = vi.fn(); start = native.start; stop = native.stop; cleanup = native.cleanup; getCurrentSelection = native.selection
} }))
let owner: DesktopSelectionTask | undefined
function setup(enabled = true) {
  const open = vi.fn()
  owner = new DesktopSelectionTask({ locale: () => ({ id: 'zh-CN', messages: zh }), enabled: () => enabled, open })
  return open
}
afterEach(() => { owner?.dispose(); owner = undefined; vi.clearAllMocks() })
it('reads selected text only on request and opens an unsent draft without clipboard fallback', async () => {
  const open = setup()
  expect(native.start).not.toHaveBeenCalled()
  await owner!.capture()
  expect(native.start).toHaveBeenCalledWith({ selectionPassiveMode: true, enableClipboard: false })
  expect(native.stop).toHaveBeenCalledOnce()
  expect(open.mock.calls).toMatchInlineSnapshot(`
    [
      [
        "selected text",
      ],
    ]
  `)
  expect(native.read).not.toHaveBeenCalled()
})
it('rejects empty and oversized selections without truncating or opening a task', async () => {
  const open = setup()
  owner!.accept('  ')
  owner!.dispose()
  const nextOpen = setup()
  owner!.accept('x'.repeat(20001))
  expect(open).not.toHaveBeenCalled()
  expect(nextOpen).not.toHaveBeenCalled()
  expect(native.message.mock.calls.map(([value]) => value)).toMatchSnapshot()
})
it('reads copied text only from the explicit clipboard action and ignores disposed requests', async () => {
  const open = setup()
  await owner!.fromClipboard()
  expect(open).toHaveBeenCalledWith('copied')
  owner!.dispose()
  await owner!.fromClipboard()
  await owner!.capture()
  expect(native.read).toHaveBeenCalledOnce()
  expect(native.unregister).toHaveBeenCalledWith('CommandOrControl+Shift+X')
})
it('contains reader failures and ignores unavailable workspace requests', async () => {
  const open = setup(false)
  await owner!.capture()
  await owner!.fromClipboard()
  expect(open).not.toHaveBeenCalled()
  owner!.dispose()
  setup()
  native.selection.mockImplementationOnce(() => { throw new Error('native read failed') })
  await owner!.capture()
  expect(native.message).toHaveBeenCalledWith(expect.objectContaining({ message: zh.selectionFailed }))
  expect(native.stop).toHaveBeenCalledOnce()
})
it('reports shortcut conflicts without unregistering another application binding', () => {
  native.register.mockReturnValueOnce(false)
  setup()
  expect(native.message).toHaveBeenCalledWith(expect.objectContaining({ message: zh.selectionShortcutBusy }))
  owner!.dispose()
  expect(native.unregister).not.toHaveBeenCalled()
})

it('explains missing macOS permission without reading selected text or prompting the OS', async () => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
  native.trusted.mockReturnValueOnce(false)
  const open = setup()
  await owner!.capture()
  expect(native.trusted).toHaveBeenCalledWith(false)
  expect(native.start).not.toHaveBeenCalled()
  expect(open).not.toHaveBeenCalled()
  expect(native.message).toHaveBeenCalledWith(expect.objectContaining({ message: zh.selectionPermission }))
  vi.restoreAllMocks()
})
