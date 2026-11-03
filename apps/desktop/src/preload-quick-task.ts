/** Compact-mode toolbar hosted by the existing trusted application preload. */
import { ipcRenderer } from 'electron'
import { QUICK_TASK_IPC, type QuickTaskView } from './quick-task-api.ts'

/** Install the native presentation receiver; selected text stays in an unsent draft until the user submits. */
export function installQuickTask(): void {
  let state: QuickTaskView | undefined
  let toolbar: HTMLElement | undefined
  let disposed = false
  let reportedPhase: string | undefined
  const observePhase = (): void => {
    const phase = document.querySelector('[data-desktop-conversation-phase]')?.getAttribute('data-desktop-conversation-phase')
    if ((phase !== 'hero' && phase !== 'active') || phase === reportedPhase || disposed) return
    reportedPhase = phase
    void ipcRenderer.invoke(QUICK_TASK_IPC.phase, phase).catch((error: unknown) => {
      reportedPhase = undefined
      console.error('Quick-task sizing failed', error)
    })
  }
  const observer = new MutationObserver(observePhase)
  observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-desktop-conversation-phase'] })
  observePhase()
  const render = (): void => {
    if (state === undefined || document.readyState === 'loading' || disposed) return
    document.documentElement.toggleAttribute('data-quick-task', state.active)
    toolbar?.remove()
    toolbar = undefined
    if (!state.active) return
    const m = state.messages
    toolbar = document.createElement('header')
    toolbar.id = 'dsh-quick-task-toolbar'
    toolbar.setAttribute('aria-label', m.quickTaskTitle)
    toolbar.style.cssText = 'position:fixed;inset:44px 16px auto;height:48px;display:flex;align-items:center;gap:8px;z-index:1;color:var(--dsw-alias-text-primary);font:13px system-ui;-webkit-app-region:drag'
    const title = document.createElement('div')
    title.style.cssText = 'flex:1;min-width:0'
    const name = document.createElement('strong')
    name.textContent = m.quickTaskTitle
    name.style.cssText = 'display:block;font-weight:500;font-size:15px'
    const hint = document.createElement('small')
    hint.textContent = m.quickTaskHint
    hint.style.cssText = 'display:block;font-size:11px;opacity:.65;margin-top:3px'
    title.append(name, hint)
    toolbar.append(title)
    for (const [action, label] of [['new', m.quickTaskNew], ['expand', m.quickTaskExpand], ['hide', m.quickTaskHide]] as const) {
      const button = document.createElement('button')
      button.textContent = label
      button.type = 'button'
      button.style.cssText = 'font:inherit;padding:6px 9px;border:1px solid var(--dsw-alias-border-l3);border-radius:8px;background:var(--dsw-alias-bg-base);color:inherit;cursor:pointer;-webkit-app-region:no-drag'
      button.addEventListener('click', () => {
        button.disabled = true
        void ipcRenderer.invoke(QUICK_TASK_IPC.action, action).catch((error: unknown) => {
          console.error('Quick-task window action failed', error)
        }).finally(() => { button.disabled = false })
      })
      toolbar.append(button)
    }
    document.documentElement.append(toolbar)
  }
  const receive = (_event: Electron.IpcRendererEvent, view: QuickTaskView): void => { state = view; render() }
  const command = (_event: Electron.IpcRendererEvent, action: unknown): void => {
    if (typeof action === 'object' && action !== null && 'sessionId' in action
      && typeof action.sessionId === 'string' && action.sessionId.length > 0 && action.sessionId.length <= 512) {
      window.dispatchEvent(new CustomEvent('dsh-task-result-open', { detail: action.sessionId }))
    }
    else if (typeof action === 'object' && action !== null && 'selectionText' in action
      && typeof action.selectionText === 'string' && action.selectionText.trim().length > 0 && action.selectionText.length <= 20000) {
      window.dispatchEvent(new CustomEvent('dsh-selection-draft', { detail: action.selectionText }))
    }
    else if (action === 'open' || action === 'new') window.dispatchEvent(new CustomEvent('dsh-quick-task-command', { detail: action }))
  }
  ipcRenderer.on(QUICK_TASK_IPC.changed, receive)
  ipcRenderer.on(QUICK_TASK_IPC.command, command)
  void ipcRenderer.invoke(QUICK_TASK_IPC.status).then((view: QuickTaskView) => {
    if (state === undefined) { state = view; render() }
  }, (error: unknown) => { console.error('Quick-task presentation unavailable', error) })
  window.addEventListener('DOMContentLoaded', render, { once: true })
  window.addEventListener('pagehide', () => {
    disposed = true
    toolbar?.remove()
    observer.disconnect()
    ipcRenderer.off(QUICK_TASK_IPC.changed, receive)
    ipcRenderer.off(QUICK_TASK_IPC.command, command)
    window.removeEventListener('DOMContentLoaded', render)
  }, { once: true })
}
