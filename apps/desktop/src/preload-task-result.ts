/** Isolated rendering and actions for the completion bubble's trusted shell document. */
import { ipcRenderer } from 'electron'
import { TASK_RESULT_IPC, type TaskResultView } from './task-result-api.ts'

if (process.isMainFrame && location.href === 'dsh-app://shell/task-result.html') {
  window.addEventListener('DOMContentLoaded', () => {
    let current: TaskResultView | null = null
    const title = document.getElementById('title')
    const detail = document.getElementById('detail')
    const open = document.getElementById('open')
    const close = document.getElementById('close')
    const render = (view: TaskResultView | null): void => {
      current = view
      if (!view) return
      if (title) title.textContent = view.title
      if (detail) detail.textContent = view.detail
      close?.setAttribute('aria-label', view.close)
      document.body.dataset.outcome = view.outcome
    }
    const action = (name: 'open' | 'close'): void => {
      if (current) void ipcRenderer.invoke(TASK_RESULT_IPC.action, name, current.token).catch((error: unknown) => {
        console.error('Task-result action failed', error)
      })
    }
    open?.addEventListener('click', () => { action('open') })
    close?.addEventListener('click', () => { action('close') })
    window.addEventListener('keydown', (event) => { if (event.key === 'Escape') action('close') })
    const changed = (_event: Electron.IpcRendererEvent, view: TaskResultView | null): void => { render(view) }
    ipcRenderer.on(TASK_RESULT_IPC.changed, changed)
    void ipcRenderer.invoke(TASK_RESULT_IPC.view).then((view: TaskResultView | null) => { if (!current) render(view) })
      .catch((error: unknown) => { console.error('Task-result presentation unavailable', error) })
    window.addEventListener('pagehide', () => { ipcRenderer.off(TASK_RESULT_IPC.changed, changed) }, { once: true })
  }, { once: true })
}
