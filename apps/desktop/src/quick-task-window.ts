/** Reuses the live workspace window in a compact mode without remounting its conversation. */
import { ipcMain, screen, type BrowserWindow, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import type { DesktopLocale } from './locale.ts'
import type { DesktopTaskResult } from './task-result-api.ts'
import { QUICK_TASK_IPC, type QuickTaskView } from './quick-task-api.ts'

/** Trusted native window and locale ownership supplied by the desktop shell. */
export interface QuickTaskOptions {
  readonly window: () => BrowserWindow | undefined
  readonly anchor: () => Rectangle | undefined
  readonly locale: () => DesktopLocale
  readonly assertSender: (event: IpcMainInvokeEvent) => BrowserWindow
}

/** Fit a compact window beside the character, including small and secondary screens.
 * @param area - Target display's usable desktop.
 * @param anchor - Current character bounds, if visible.
 * @param empty - Use the smaller unsent-task size when true; defaults to transcript size.
 * @returns A wholly visible task window.
 */
export function quickTaskBounds(area: Rectangle, anchor?: Rectangle, empty = false): Rectangle {
  const width = Math.min(empty ? 400 : 480, area.width)
  const height = Math.min(empty ? 360 : 660, area.height)
  const preferredX = anchor === undefined ? area.x + area.width - width - 20
    : anchor.x - width - 12 >= area.x ? anchor.x - width - 12 : anchor.x + anchor.width + 12
  return { width, height,
    x: Math.max(area.x, Math.min(preferredX, area.x + area.width - width)),
    y: Math.max(area.y, Math.min((anchor?.y ?? area.y + area.height) - 180, area.y + area.height - height)),
  }
}

/** Owns compact geometry and explicit draft/navigation handoff; closing or expanding never sends or cancels a task. */
export class DesktopQuickTask {
  private saved: { window: BrowserWindow; bounds: Rectangle; minimum: number[]; maximized: boolean; pinned: boolean } | undefined
  private disposed = false
  private empty = true

  /** @param options - Existing application-window ownership and local copy. */
  constructor(private readonly options: QuickTaskOptions) {
    ipcMain.handle(QUICK_TASK_IPC.phase, (event: IpcMainInvokeEvent, phase: unknown): void => {
      const window = options.assertSender(event)
      if (phase !== 'hero' && phase !== 'active') throw new Error('Unsupported quick-task phase')
      const empty = phase === 'hero'
      if (this.empty === empty) return
      this.empty = empty
      if (this.saved?.window !== window) return
      const previous = window.getNormalBounds()
      const area = screen.getDisplayMatching(previous).workArea
      const size = quickTaskBounds(area, undefined, empty)
      window.setMinimumSize(Math.min(400, size.width), Math.min(320, size.height))
      window.setBounds({ ...size,
        x: Math.max(area.x, Math.min(previous.x, area.x + area.width - size.width)),
        y: Math.max(area.y, Math.min(previous.y, area.y + area.height - size.height)),
      })
    })
    ipcMain.handle(QUICK_TASK_IPC.status, (event: IpcMainInvokeEvent): QuickTaskView => {
      options.assertSender(event)
      return this.view()
    })
    ipcMain.handle(QUICK_TASK_IPC.action, (event: IpcMainInvokeEvent, action: unknown): void => {
      const window = options.assertSender(event)
      if (action === 'expand') { this.restore(); window.show(); window.focus() }
      else if (action === 'hide') window.hide()
      else if (action === 'new') window.webContents.send(QUICK_TASK_IPC.command, 'new')
      else throw new Error('Unsupported quick-task action')
    })
  }

  /** @returns Whether the compact task window is visible and holding attention. */
  isVisible(): boolean { return this.saved !== undefined && !this.saved.window.isDestroyed() && this.saved.window.isVisible() }

  /** Open the current conversation as a compact task window; fullscreen exits before resizing. */
  show(): void {
    const window = this.options.window()
    if (this.disposed || window === undefined || window.isDestroyed()) return
    if (window.isFullScreen()) {
      window.once('leave-full-screen', () => { if (!this.disposed) this.show() })
      window.setFullScreen(false)
      return
    }
    if (this.saved?.window !== window) {
      this.saved = { window, bounds: window.getNormalBounds(), minimum: window.getMinimumSize(),
        maximized: window.isMaximized(), pinned: window.isAlwaysOnTop() }
      if (window.isMaximized()) window.unmaximize()
    }
    const anchor = this.options.anchor()
    const area = anchor === undefined ? screen.getPrimaryDisplay().workArea : screen.getDisplayMatching(anchor).workArea
    const bounds = quickTaskBounds(area, anchor, this.empty)
    window.setMinimumSize(Math.min(400, bounds.width), Math.min(320, bounds.height))
    window.setBounds(bounds)
    window.setAlwaysOnTop(true)
    window.webContents.send(QUICK_TASK_IPC.changed, this.view())
    window.webContents.send(QUICK_TASK_IPC.command, 'open')
    if (window.isMinimized()) window.restore()
    window.show()
    window.focus()
  }

  /** @param sessionId - Host-originated session to reveal from a completion bubble. */
  openSession(sessionId: DesktopTaskResult['sessionId']): void {
    this.show()
    this.options.window()?.webContents.send(QUICK_TASK_IPC.command, { sessionId })
  }

  /** @param text - Explicitly selected text, opened as an unsent draft without replacing existing input. */
  openSelection(text: string): void {
    this.show()
    this.options.window()?.webContents.send(QUICK_TASK_IPC.command, { selectionText: text })
  }

  /** Restore the saved full workspace geometry without changing its session or visibility. */
  restore(): void {
    const saved = this.saved
    if (saved === undefined) return
    this.saved = undefined
    if (saved.window.isDestroyed()) return
    const [width = 520, height = 600] = saved.minimum
    saved.window.setMinimumSize(width, height)
    saved.window.setAlwaysOnTop(saved.pinned)
    const area = screen.getDisplayMatching(saved.bounds).workArea
    saved.window.setBounds({ ...saved.bounds,
      x: Math.max(area.x, Math.min(saved.bounds.x, area.x + area.width - saved.bounds.width)),
      y: Math.max(area.y, Math.min(saved.bounds.y, area.y + area.height - saved.bounds.height)),
    })
    if (saved.maximized) saved.window.maximize()
    saved.window.webContents.send(QUICK_TASK_IPC.changed, this.view())
  }

  /** Remove shell IPC before application shutdown. */
  dispose(): void {
    this.disposed = true
    ipcMain.removeHandler(QUICK_TASK_IPC.phase)
    ipcMain.removeHandler(QUICK_TASK_IPC.status)
    ipcMain.removeHandler(QUICK_TASK_IPC.action)
  }

  private view(): QuickTaskView {
    const m = this.options.locale().messages
    return { active: this.saved !== undefined, messages: {
      quickTaskTitle: m.quickTaskTitle, quickTaskHint: m.quickTaskHint, quickTaskNew: m.quickTaskNew,
      quickTaskExpand: m.quickTaskExpand, quickTaskHide: m.quickTaskHide,
    } }
  }
}
