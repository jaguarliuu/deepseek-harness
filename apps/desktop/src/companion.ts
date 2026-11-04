/** Optional native desktop companion; hiding pauses read-only task inspection. */
import { join } from 'node:path'
import { BrowserWindow, ipcMain, screen, type IpcMainInvokeEvent } from 'electron'
import type { DesktopLocale } from './locale.ts'
import type { DesktopQuitInspection } from './host-process.ts'
import { CompanionChoreography } from './companion-motion.ts'
import { COMPANION_IPC, type CompanionView } from './companion-api.ts'

const DOCUMENT = 'dsh-app://shell/companion.html'

/** Main-process dependencies; inspections retain the Host's bounded deadline. */
export interface CompanionOptions {
  readonly appPath: string
  readonly locale: () => DesktopLocale
  readonly open: () => void
  readonly isInteracting?: () => boolean
  readonly inspect: () => Promise<DesktopQuitInspection> | undefined
}

/** Owns one transparent window, its IPC handlers, and a non-overlapping status poll. */
export class DesktopCompanion {
  private window: BrowserWindow | undefined
  private disposed = false
  private shown = false
  private collapsed = false
  private dock: 'left' | 'right' | null = null
  private tucked = false
  private dockRevision = 0
  private dockSettled = true
  private dockLeaveSince: number | undefined
  private state: CompanionView['state'] = 'unknown'
  private timer: ReturnType<typeof setTimeout> | undefined
  private inspecting = false
  private drag: {
    x: number
    y: number
    cursorX: number
    cursorY: number
    moved: boolean
    lastX: number
    lastY: number
    lastAt: number
    fast: boolean
  } | undefined
  private roaming = true
  private reduced = true
  private nativeDragTimer: ReturnType<typeof setTimeout> | undefined
  private motionTimer: ReturnType<typeof setTimeout> | undefined
  private readonly motion = new CompanionChoreography(Date.now())

  /** @param options - Trusted shell callbacks and packaged asset root. */
  constructor(private readonly options: CompanionOptions) {
    ipcMain.handle(COMPANION_IPC.view, (event: IpcMainInvokeEvent): CompanionView => {
      this.assertSender(event)
      const m = options.locale().messages
      return { dockRevision: this.dockRevision, dock: this.dock, tucked: this.tucked, state: this.state, collapsed: this.collapsed,
        roaming: this.roaming, reduced: this.reduced,
        motion: this.motion.view(), messages: {
          aboutProduct: m.aboutProduct, openApplication: m.quickTaskTitle,
          companionIdle: m.companionIdle, companionBusy: m.companionBusy, companionUnknown: m.companionUnknown,
          companionCollapse: m.companionCollapse, companionExpand: m.companionExpand, companionHide: m.companionHide,
          companionGreet: m.companionGreet, companionRoam: m.companionRoam, companionStay: m.companionStay,
        } }
    })
    ipcMain.handle(COMPANION_IPC.action, (event: IpcMainInvokeEvent, action: unknown): void => {
      this.assertSender(event)
      if (action === 'open') { this.motion.wake(Date.now()); options.open() }
      else if (action === 'wake') this.motion.wake(Date.now())
      else if (action === 'pet') { if (this.state === 'idle') this.motion.pet(Date.now()) }
      else if (action === 'hat') { if (this.state === 'idle') this.motion.tapHat(Date.now()) }
      else if (action === 'drag-start') {
        this.motion.wake(Date.now())
        if (this.tucked) { this.tucked = false; this.fit() }
        const window = this.window
        if (!window) throw new Error('Companion window unavailable')
        const bounds = window.getBounds()
        const cursor = screen.getCursorScreenPoint()
        this.drag = { x: bounds.x, y: bounds.y, cursorX: cursor.x, cursorY: cursor.y, moved: false,
          lastX: cursor.x, lastY: cursor.y, lastAt: Date.now(), fast: false }
      }
      else if (action === 'drag-end') {
        this.moveDrag()
        const moved = this.drag?.moved
        if (moved) this.motion.drop(Date.now(), this.drag?.fast === true)
        this.drag = undefined
        if (moved) this.snapToEdge()
      }
      else if (action === 'hide') { this.motion.drop(Date.now(), false); this.shown = false; this.drag = undefined; this.window?.hide() }
      else if (action === 'greet') this.motion.greet(Date.now())
      else if (action === 'roam') this.roaming = !this.roaming
      else if (action === 'reduce-on' || action === 'reduce-off') {
        if (this.reduced && action === 'reduce-off') this.motion.greet(Date.now())
        this.reduced = action === 'reduce-on'
      }
      else if (action === 'collapse') {
        this.dock = null
        this.tucked = false
        this.collapsed = !this.collapsed
        this.fit()
      } else throw new Error('Unsupported companion action')
      this.animate()
    })
    ipcMain.handle(COMPANION_IPC.settled, (event: IpcMainInvokeEvent, revision: unknown): void => {
      this.assertSender(event)
      if (typeof revision !== 'number' || !Number.isSafeInteger(revision)) throw new Error('Invalid dock revision')
      if (revision !== this.dockRevision) return
      this.dockSettled = true
      this.fit()
    })
    screen.on('display-removed', this.fit)
    screen.on('display-metrics-changed', this.fit)
  }

  /** @returns Whether the user has left the companion enabled in this run. */
  isShown(): boolean { return this.shown && !this.disposed }

  /** React to a Host-confirmed completion only while the companion is visible. */
  completed(): void {
    if (!this.shown || this.disposed || this.reduced) return
    this.motion.complete(Date.now())
    this.animate()
  }

  /** @returns Current native position used to anchor the task window. */
  bounds(): Electron.Rectangle | undefined { return this.window?.getBounds() }

  /** Show or restore the companion without stealing keyboard focus. */
  show(): void {
    if (this.disposed) return
    this.shown = true
    if (this.window !== undefined) { this.fit(); this.window.showInactive(); void this.inspect(); return }
    const window = new BrowserWindow({
      width: 220, height: 256, show: false, frame: false, transparent: true,
      resizable: false, maximizable: false, minimizable: false, skipTaskbar: true,
      alwaysOnTop: true, hasShadow: false, title: this.options.locale().messages.aboutProduct,
      webPreferences: { preload: join(this.options.appPath, 'lib/preload-companion.cjs'),
        contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: false },
    })
    this.window = window
    const area = screen.getPrimaryDisplay().workArea
    window.setPosition(area.x + area.width - 240, area.y + area.height - 276)
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', (event) => { event.preventDefault() })
    window.on('hide', () => {
      this.drag = undefined
      clearTimeout(this.timer); clearTimeout(this.nativeDragTimer)
      if (!this.shown) clearTimeout(this.motionTimer)
      this.nativeDragTimer = undefined; this.timer = undefined
    })
    window.on('closed', () => {
      this.window = undefined
      clearTimeout(this.timer); clearTimeout(this.motionTimer); clearTimeout(this.nativeDragTimer)
      this.nativeDragTimer = undefined
    })
    window.on('show', () => { void this.inspect(); this.animate() })
    window.on('moved', this.fit)
    window.on('will-move', () => {
      this.dock = null
      if (!this.reduced) this.motion.lift(Date.now())
      clearTimeout(this.nativeDragTimer)
      this.nativeDragTimer = setTimeout(() => {
        this.nativeDragTimer = undefined
        if (this.disposed || !this.shown) return
        this.motion.drop(Date.now(), false)
        this.fit()
        this.snapToEdge()
        this.animate()
      }, 250)
    })
    void window.loadURL(DOCUMENT).then(() => {
      if (!window.isDestroyed() && !this.disposed) { this.fit(); window.showInactive() }
    }).catch((error: unknown) => {
      console.error('Desktop companion could not load; reopen it from the application menu', error)
      if (!window.isDestroyed()) window.destroy()
    })
  }

  /** Remove native resources; an in-flight inspection cannot publish after disposal. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.shown = false
    this.drag = undefined
    clearTimeout(this.timer)
    clearTimeout(this.motionTimer)
    clearTimeout(this.nativeDragTimer)
    screen.removeListener('display-removed', this.fit)
    screen.removeListener('display-metrics-changed', this.fit)
    ipcMain.removeHandler(COMPANION_IPC.view)
    ipcMain.removeHandler(COMPANION_IPC.action)
    ipcMain.removeHandler(COMPANION_IPC.settled)
    this.window?.destroy()
    this.window = undefined
  }

  private assertSender(event: IpcMainInvokeEvent): void {
    if (this.disposed || event.sender !== this.window?.webContents || event.senderFrame !== event.sender.mainFrame
      || event.senderFrame.url !== DOCUMENT) throw new Error('Untrusted companion sender')
  }

  private readonly fit = (): void => {
    const window = this.window
    if (window === undefined || window.isDestroyed()) return
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const width = this.tucked && this.dockSettled ? 64 : 220
    const height = this.tucked && this.dockSettled ? 72 : this.collapsed ? 108 : 256
    const x = this.dock === 'left' ? area.x : this.dock === 'right' ? area.x + area.width - width
      : Math.max(area.x, Math.min(bounds.x, area.x + area.width - width))
    const y = Math.max(area.y, Math.min(this.dock ? bounds.y : bounds.y + bounds.height - height, area.y + area.height - height))
    if (x !== bounds.x || y !== bounds.y || width !== bounds.width || height !== bounds.height) window.setBounds({ x, y, width, height })
  }

  private snapToEdge(): void {
    const window = this.window
    if (!window || window.isDestroyed()) return
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    this.dock = bounds.x - area.x <= 24 ? 'left'
      : area.x + area.width - bounds.x - bounds.width <= 24 ? 'right' : null
    this.tucked = false
    this.dockLeaveSince = undefined
    if (this.dock) { this.collapsed = false; this.fit() }
  }

  private transitionDock(tucked: boolean): void {
    this.tucked = tucked
    this.dockRevision++
    this.dockSettled = this.reduced
    this.fit()
    this.window?.webContents.send(COMPANION_IPC.changed)
  }

  private updateDock(): void {
    const window = this.window
    if (!this.dock || !window || window.isDestroyed()) return
    const bounds = window.getBounds()
    const cursor = screen.getCursorScreenPoint()
    const width = this.tucked ? 64 : bounds.width
    const height = this.tucked ? 72 : bounds.height
    const x = this.tucked && this.dock === 'right' ? bounds.x + bounds.width - width : bounds.x
    const margin = this.tucked ? 0 : 12
    const inside = cursor.x >= x - margin && cursor.x <= x + width + margin
      && cursor.y >= bounds.y - margin && cursor.y <= bounds.y + height + margin
    if (inside || this.options.isInteracting?.() === true) {
      this.dockLeaveSince = undefined
      if (this.tucked) { this.motion.wake(Date.now()); this.transitionDock(false) }
    } else {
      this.dockLeaveSince ??= Date.now()
      if (!this.tucked && Date.now() - this.dockLeaveSince >= 1000) this.transitionDock(true)
    }
  }

  private moveDrag(): void {
    const window = this.window
    if (!this.drag || !window || window.isDestroyed()) return
    const cursor = screen.getCursorScreenPoint()
    const dx = cursor.x - this.drag.cursorX
    const dy = cursor.y - this.drag.cursorY
    if (Math.hypot(dx, dy) < 4) return
    const now = Date.now()
    const elapsed = now - this.drag.lastAt
    if (elapsed > 0 && Math.hypot(cursor.x - this.drag.lastX, cursor.y - this.drag.lastY) / elapsed > 1.4) this.drag.fast = true
    this.drag.lastX = cursor.x; this.drag.lastY = cursor.y; this.drag.lastAt = now
    if (!this.reduced) this.motion.lift(now)
    this.drag.moved = true
    this.dock = null
    this.tucked = false
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching({ x: cursor.x, y: cursor.y, width: 1, height: 1 }).workArea
    window.setPosition(Math.round(Math.max(area.x, Math.min(this.drag.x + dx, area.x + area.width - bounds.width))),
      Math.round(Math.max(area.y, Math.min(this.drag.y + dy, area.y + area.height - bounds.height))))
  }

  private animate(): void {
    clearTimeout(this.motionTimer)
    const window = this.window
    if (this.disposed || window === undefined || !this.shown) return
    if (this.drag) {
      this.moveDrag()
      this.motionTimer = setTimeout(() => { this.animate() }, 16)
      return
    }
    this.updateDock()
    const bounds = window.getBounds()
    const area = screen.getDisplayMatching(bounds).workArea
    const cursor = screen.getCursorScreenPoint()
    const nearby = cursor.x >= bounds.x - 24 && cursor.x <= bounds.x + bounds.width + 24
      && cursor.y >= bounds.y - 24 && cursor.y <= bounds.y + bounds.height + 24
    const dx = this.motion.tick({ now: Date.now(), active: !this.collapsed && !this.tucked, busy: this.state === 'busy',
      roaming: this.roaming && !this.dock && !this.nativeDragTimer && this.state === 'idle', reduced: this.reduced, nearby: nearby || this.options.isInteracting?.() === true,
      x: bounds.x, minX: area.x, maxX: area.x + area.width - bounds.width })
    if (Math.abs(dx) >= 0.5) window.setPosition(Math.round(bounds.x + dx), bounds.y)
    this.motionTimer = setTimeout(() => { this.animate() }, this.dock || this.motion.view().pose === 'walk' ? 40 : 200)
  }

  private canInspect(): boolean { return !this.disposed && this.window?.isVisible() === true }

  private async inspect(): Promise<void> {
    clearTimeout(this.timer)
    if (this.disposed || this.inspecting || this.window?.isVisible() !== true) return
    this.inspecting = true
    try {
      const result = await this.options.inspect()
      this.state = result === undefined ? 'unknown' : result.activeTasks ? 'busy' : 'idle'
    } catch (_error) {
      // Host restarts and timeouts leave status unknown; the next visible poll retries.
      this.state = 'unknown'
    } finally {
      this.inspecting = false
      if (this.canInspect()) this.timer = setTimeout(() => { void this.inspect() }, 3000)
    }
  }
}
