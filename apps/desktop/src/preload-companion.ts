/** Sandboxed bridge exclusively for the companion document. */
import { contextBridge, ipcRenderer } from 'electron'
import { COMPANION_IPC, type CompanionApi, type CompanionView } from './companion-api.ts'

const api: CompanionApi = {
  view: () => ipcRenderer.invoke(COMPANION_IPC.view) as Promise<CompanionView>,
  onChange: (listener) => {
    const notify = () => { listener() }
    ipcRenderer.on(COMPANION_IPC.changed, notify)
    return () => { ipcRenderer.removeListener(COMPANION_IPC.changed, notify) }
  },
  settleDock: revision => ipcRenderer.invoke(COMPANION_IPC.settled, revision) as Promise<void>,
  action: action => ipcRenderer.invoke(COMPANION_IPC.action, action) as Promise<void>,
}
if (process.isMainFrame && location.href === 'dsh-app://shell/companion.html') contextBridge.exposeInMainWorld('xiaoc', api)
