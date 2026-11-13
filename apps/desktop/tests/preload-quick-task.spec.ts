// @vitest-environment jsdom
import type { IpcRendererEvent } from 'electron'
import { afterEach, expect, it, vi } from 'vitest'
import { installQuickTask } from '../src/preload-quick-task.ts'
import { QUICK_TASK_IPC, type QuickTaskView } from '../src/quick-task-api.ts'
import { resolveDesktopLocale } from '../src/locale.ts'

const ipc = vi.hoisted(() => ({
  invoke: vi.fn(), on: vi.fn<(channel: string, listener: (event: IpcRendererEvent, payload: unknown) => void) => void>(), off: vi.fn(),
}))
vi.mock('electron', () => ({ ipcRenderer: ipc }))
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'))
  document.documentElement.removeAttribute('data-quick-task')
  vi.clearAllMocks()
})
it('renders localized compact controls and preserves the existing page', async () => {
  const view: QuickTaskView = { active: true, messages: resolveDesktopLocale('zh').messages }
  ipc.invoke.mockResolvedValue(view)
  const root = document.createElement('div')
  root.id = 'application-test'
  document.body.append(root)
  installQuickTask()
  await Promise.resolve()
  window.dispatchEvent(new Event('DOMContentLoaded'))
  const toolbar = document.getElementById('dsh-quick-task-toolbar')!
  expect(toolbar.textContent).toBe('小 C · 快捷任务收起小窗，任务继续执行新任务展开收起')
  expect(document.getElementById('application-test')).toBe(root)
  toolbar.querySelector('button')!.click()
  expect(ipc.invoke).toHaveBeenCalledWith(QUICK_TASK_IPC.action, 'new')
  expect(document.documentElement.hasAttribute('data-quick-task')).toBe(true)
  window.dispatchEvent(new Event('pagehide'))
  expect(document.getElementById('dsh-quick-task-toolbar')).toBeNull()
  root.remove()
})

it('passes bounded selected text to the draft owner without executing it', async () => {
  ipc.invoke.mockResolvedValue({ active: false, messages: resolveDesktopLocale('zh').messages })
  installQuickTask()
  const listener = vi.fn<(event: Event) => void>()
  window.addEventListener('dsh-selection-draft', listener)
  const command = ipc.on.mock.calls.find(([channel]) => channel === QUICK_TASK_IPC.command)![1]
  command({} as IpcRendererEvent, { selectionText: '选择的文字' })
  for (const selectionText of ['', ' ', 123, 'x'.repeat(20001)]) command({} as IpcRendererEvent, { selectionText })
  expect(listener).toHaveBeenCalledOnce()
  const event = listener.mock.calls[0]![0]
  expect(event).toBeInstanceOf(CustomEvent)
  expect((event as CustomEvent<string>).detail).toBe('选择的文字')
  window.removeEventListener('dsh-selection-draft', listener)
})

it('reports settled conversation presentation changes and disconnects the observer on teardown', async () => {
  ipc.invoke.mockResolvedValue({ active: false, messages: resolveDesktopLocale('zh').messages })
  const root = document.createElement('div')
  root.setAttribute('data-desktop-conversation-phase', 'hero')
  document.body.append(root)
  installQuickTask()
  expect(ipc.invoke).toHaveBeenCalledWith(QUICK_TASK_IPC.phase, 'hero')
  root.setAttribute('data-desktop-conversation-phase', 'active')
  await vi.waitFor(() => { expect(ipc.invoke).toHaveBeenCalledWith(QUICK_TASK_IPC.phase, 'active') })
  window.dispatchEvent(new Event('pagehide'))
  ipc.invoke.mockClear()
  root.setAttribute('data-desktop-conversation-phase', 'hero')
  await Promise.resolve()
  expect(ipc.invoke).not.toHaveBeenCalled()
  root.remove()
})
it('can start before Chromium creates the document element', async () => {
  ipc.invoke.mockResolvedValue({ active: false, messages: resolveDesktopLocale('zh').messages })
  const root = document.documentElement
  document.removeChild(root)
  try {
    expect(() => { installQuickTask() }).not.toThrow()
  } finally {
    document.append(root)
  }
  await Promise.resolve()
})
