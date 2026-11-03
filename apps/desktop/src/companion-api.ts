/** Restricted bridge for the shell-owned desktop companion. */
import type { CompanionMotion } from './companion-motion.ts'
import type { DesktopMessages } from './locale.ts'

/** Channels are owned and removed by DesktopCompanion. */
export const COMPANION_IPC = { view: 'companion:view', action: 'companion:action', changed: 'companion:changed', settled: 'companion:settled' } as const
/** Presentation never infers completion from absence of active work. */
export interface CompanionView {
  readonly dock: 'left' | 'right' | null
  readonly tucked: boolean
  readonly dockRevision: number
  readonly state: 'idle' | 'busy' | 'unknown'
  readonly collapsed: boolean
  readonly roaming: boolean
  readonly reduced: boolean
  readonly motion: CompanionMotion
  readonly messages: Pick<DesktopMessages, 'aboutProduct' | 'openApplication' | 'companionIdle' | 'companionBusy' | 'companionUnknown' | 'companionCollapse' | 'companionExpand' | 'companionHide' | 'companionGreet' | 'companionRoam' | 'companionStay'>
}
/** Only local window actions are exposed; no filesystem or task mutation. */
export interface CompanionApi {
  /** @returns Current main-process presentation. */
  view(): Promise<CompanionView>
  /** @param listener - Refresh presentation when native docking changes. @returns Listener disposer. */
  onChange(listener: () => void): () => void
  /** @param revision - Completed dock transition; stale acknowledgements are ignored. */
  settleDock(revision: number): Promise<void>
  /** @param action - Open the workspace, toggle compact mode, or hide this window. */
  action(action: 'open' | 'collapse' | 'hide' | 'greet' | 'roam' | 'reduce-on' | 'reduce-off' | 'drag-start' | 'drag-end' | 'pet' | 'wake'): Promise<void>
}
