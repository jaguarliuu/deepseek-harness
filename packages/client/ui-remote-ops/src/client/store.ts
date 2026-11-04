/** Retain open terminal identities when navigating between the console and conversation. */
import { defineStore, type EngineStoreHandle } from '@deepseek-ai/dsh-client-store'
import type { ServerView, TerminalId } from '../types.ts'
/** One local UI tab; contains no credentials or terminal output. */
export interface TerminalTab {
  id: TerminalId
  server: ServerView
}
interface TerminalState {
  tabs: TerminalTab[]
  notice: string
  sequence: number
}
type TerminalActions = {
  notify: (draft: TerminalState, message: string) => void
  clearNotice: (draft: TerminalState) => void
  add: (draft: TerminalState, tab: TerminalTab) => void
  remove: (draft: TerminalState, id: TerminalId) => void
}
/**
 * Create a registry-owned terminal tab store, scoped to one client lifetime.
 * @returns fresh store declaration.
 */
export function createTerminalStore(): EngineStoreHandle<TerminalState, TerminalActions> {
  return defineStore({
    init: (): { tabs: TerminalTab[]; notice: string; sequence: number } => ({ tabs: [], notice: '', sequence: 0 }),
    actions: {
      notify: (draft, message: string) => {
        draft.notice = message
        draft.sequence += 1
      },
      clearNotice: (draft) => {
        draft.notice = ''
      },
      add: (draft, tab: TerminalTab) => {
        draft.tabs.push(tab)
      },
      remove: (draft, id: TerminalId) => {
        draft.tabs = draft.tabs.filter(v => v.id !== id)
      },
    },
  })
}
