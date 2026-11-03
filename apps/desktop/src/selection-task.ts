/** Explicit text-selection handoff; no background selection collection or automatic submission. */
import { clipboard, dialog, globalShortcut, systemPreferences } from 'electron'
import type SelectionHook from 'selection-hook'
import type { DesktopLocale } from './locale.ts'

const ACCELERATOR = 'CommandOrControl+Shift+X'
/** Shell collaborators retain workspace readiness and draft ownership. */
export interface SelectionTaskOptions {
  readonly locale: () => DesktopLocale
  readonly enabled: () => boolean
  readonly open: (text: string) => void
}
/** Owns the global shortcut and lazily loaded native selection reader. */
export class DesktopSelectionTask {
  private hook: SelectionHook | undefined
  private busy = false
  private reporting = false
  private disposed = false
  private registered: boolean

  /** @param options - Localized reports and the existing quick-task draft entry. */
  constructor(private readonly options: SelectionTaskOptions) {
    this.registered = globalShortcut.register(ACCELERATOR, () => { void this.capture() })
    if (!this.registered) this.report('selectionShortcutBusy')
  }

  /** Read only after an explicit shortcut/menu action, before activating the task window. */
  async capture(): Promise<void> {
    if (this.disposed || this.busy || this.reporting || !this.options.enabled()) return
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      this.report('selectionPermission')
      return
    }
    this.busy = true
    try {
      if (!this.hook) {
        const { default: Hook } = await import('selection-hook')
        if (!this.available()) return
        this.hook = new Hook()
        // Native failures must not become unhandled EventEmitter errors or log selected content.
        this.hook.on('error', () => { this.report('selectionFailed') })
      }
      if (!this.hook.start({ selectionPassiveMode: true, enableClipboard: false })) {
        this.report('selectionFailed')
        return
      }
      const selection = this.hook.getCurrentSelection()
      this.accept(selection?.text ?? '')
    } catch (_error) {
      // The optional native reader failing must not prevent ordinary tasks or explicit clipboard use.
      this.report('selectionFailed')
    } finally {
      this.hook?.stop()
      this.busy = false
    }
  }

  /** Read the clipboard only when the user explicitly chooses the copied-text menu entry. */
  async fromClipboard(): Promise<void> {
    if (!this.available()) return
    try {
      const text = await clipboard.readText()
      this.accept(text)
    } catch (_error) {
      // Clipboard ownership can temporarily prevent reads; the user can retry explicitly.
      this.report('selectionFailed')
    }
  }

  private available(): boolean { return !this.disposed && this.options.enabled() }

  /** @param text - Electron context-menu selection or explicitly requested native/clipboard text. */
  accept(text: string): void {
    if (this.disposed || !this.options.enabled()) return
    if (text.trim().length === 0) { this.report('selectionEmpty'); return }
    if (text.length > 20000) { this.report('selectionTooLong'); return }
    this.options.open(text)
  }

  /** Unregister only this feature's shortcut and release native resources before quitting. */
  dispose(): void {
    this.disposed = true
    if (this.registered) globalShortcut.unregister(ACCELERATOR)
    this.registered = false
    this.hook?.cleanup()
    this.hook = undefined
  }

  private report(key: 'selectionEmpty' | 'selectionPermission' | 'selectionFailed' | 'selectionTooLong' | 'selectionShortcutBusy'): void {
    if (this.disposed || this.reporting) return
    this.reporting = true
    const m = this.options.locale().messages
    void dialog.showMessageBox({ type: 'info', title: m.selectionAsk, message: m[key], buttons: [m.backgroundNoticeConfirm] })
      .catch((error: unknown) => { console.error('Selection notice could not be displayed', error) })
      .finally(() => { this.reporting = false })
  }
}
