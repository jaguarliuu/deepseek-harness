/** Non-focusing, bounded task-result bubbles on the desktop. */
import { join } from 'node:path'
import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent, type Rectangle } from 'electron'
import type { DesktopLocale } from './locale.ts'
import { TASK_RESULT_IPC, type DesktopTaskResult, type TaskResultView } from './task-result-api.ts'

const DOCUMENT = 'dsh-app://shell/task-result.html'
/** Dependencies retain native window and session navigation ownership in the shell. */
export interface TaskResultBubbleOptions {
  readonly appPath: string
  readonly locale: () => DesktopLocale
  readonly anchor: () => Rectangle | undefined
  readonly enabled: () => boolean
  readonly open: (result: DesktopTaskResult) => void
}
/** Owns the bubble window, pending results, timeout, and sender validation. */
export class DesktopTaskResultBubble {
  private window: BrowserWindow | undefined
  private ready = false
  private disposed = false
  private pending: DesktopTaskResult[] = []
  private current: { result: DesktopTaskResult; token: number; expires: number } | undefined
  private sequence = 0
  private timer: ReturnType<typeof setTimeout> | undefined
  private seen = new Set<string>()

  /** @param options - Trusted shell callbacks; no task content is exposed. */
  constructor(private readonly options: TaskResultBubbleOptions) {
    ipcMain.handle(TASK_RESULT_IPC.view, (event: IpcMainInvokeEvent) => { this.assertSender(event); return this.view() })
    ipcMain.handle(TASK_RESULT_IPC.action, (event: IpcMainInvokeEvent, action: unknown, token: unknown) => {
      this.assertSender(event)
      if (action !== 'open' && action !== 'close') throw new Error('Unsupported task-result action')
      if (typeof token !== 'number' || !Number.isSafeInteger(token)) throw new Error('Invalid task-result token')
      if (!this.current || token !== this.current.token) return
      const result = this.current.result
      this.pending = []
      this.current = undefined
      clearTimeout(this.timer)
      this.window?.hide()
      if (action === 'open') options.open(result)
    })
  }

  /** @returns Whether a result is being presented on the desktop. */
  isVisible(): boolean { return this.current !== undefined }

  /** @param result - One live Host result, deduplicated within this application run. */
  notify(result: DesktopTaskResult): void {
    if (this.disposed || !this.options.enabled()) return
    const key = `${result.sessionId}/${result.turn}`
    if (this.seen.has(key)) return
    this.seen.add(key)
    if (this.seen.size > 100) { const first = this.seen.values().next(); if (!first.done) this.seen.delete(first.value) }
    this.pending.push(result)
    if (this.pending.length > 5) this.pending.shift()
    if (!this.current) this.advance()
  }

  /** Dispose before application windows are destroyed. */
  dispose(): void {
    this.disposed = true
    clearTimeout(this.timer)
    this.pending = []
    this.current = undefined
    this.seen.clear()
    ipcMain.removeHandler(TASK_RESULT_IPC.view)
    ipcMain.removeHandler(TASK_RESULT_IPC.action)
    this.window?.destroy()
    this.window = undefined
  }

  private assertSender(event: IpcMainInvokeEvent): void {
    if (this.disposed || event.sender !== this.window?.webContents || event.senderFrame !== event.sender.mainFrame
      || event.senderFrame.url !== DOCUMENT) throw new Error('Untrusted task-result sender')
  }

  private view(): TaskResultView | null {
    if (!this.current) return null
    const m = this.options.locale().messages
    const outcome = this.current.result.outcome
    return { token: this.current.token, outcome, title: outcome === 'completed' ? m.taskResultDone : m.taskResultFailed,
      detail: m.taskResultDetail, close: m.taskResultClose }
  }

  private advance(): void {
    const result = this.pending.shift()
    if (!result) { this.current = undefined; this.window?.hide(); return }
    this.current = { result, token: ++this.sequence, expires: Date.now() + 12000 }
    if (!this.window) {
      const window = new BrowserWindow({ width: 300, height: 106, show: false, frame: false, transparent: true,
        resizable: false, maximizable: false, minimizable: false, skipTaskbar: true, alwaysOnTop: true, hasShadow: false,
        title: this.options.locale().messages.aboutProduct,
        webPreferences: { preload: join(this.options.appPath, 'lib/preload-task-result.cjs'),
          contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false } })
      this.window = window
      window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
      window.webContents.on('will-navigate', (event) => { event.preventDefault() })
      void window.loadURL(DOCUMENT).then(() => {
        if (this.disposed || window.isDestroyed()) return
        this.ready = true
        this.present()
      }).catch((error: unknown) => {
        console.error('Desktop task-result bubble failed to load', error)
        this.pending = []; this.current = undefined
        if (!window.isDestroyed()) window.destroy()
        this.window = undefined
      })
    } else this.present()
  }

  private present(): void {
    if (!this.ready || !this.current || !this.window || this.disposed) return
    this.current.expires = Date.now() + 12000
    this.position()
    this.window.webContents.send(TASK_RESULT_IPC.changed, this.view())
    this.window.showInactive()
    this.tick()
  }

  private position(): void {
    const anchor = this.options.anchor()
    const window = this.window
    if (!anchor || !window) return
    const area = screen.getDisplayMatching(anchor).workArea
    const x = Math.max(area.x, Math.min(anchor.x + anchor.width / 2 - 150, area.x + area.width - 300))
    const y = Math.max(area.y, Math.min(anchor.y >= area.y + 114 ? anchor.y - 114 : anchor.y + anchor.height + 8,
      area.y + area.height - 106))
    const bounds = window.getBounds()
    if (bounds.x !== Math.round(x) || bounds.y !== Math.round(y)) window.setPosition(Math.round(x), Math.round(y))
  }

  private tick(): void {
    clearTimeout(this.timer)
    if (this.disposed || !this.current) return
    if (!this.options.enabled()) { this.pending = []; this.current = undefined; this.window?.hide(); return }
    if (Date.now() >= this.current.expires) { this.current = undefined; this.advance(); return }
    this.position()
    this.timer = setTimeout(() => { this.tick() }, 250)
  }
}
