/** Private shell presentation of live top-level turn results. */
import type { SessionId } from '@deepseek-ai/dsh-session/types'

/** Outcome delivered by the Host; carries no transcript or credential data. */
export interface DesktopTaskResult {
  readonly sessionId: SessionId
  readonly turn: number
  readonly outcome: 'completed' | 'error'
}
/** Channels restricted to the completion bubble's own document. */
export const TASK_RESULT_IPC = { view: 'task-result:view', action: 'task-result:action', changed: 'task-result:changed' } as const
/** Localized content and opaque action token for one bubble. */
export interface TaskResultView {
  readonly token: number
  readonly outcome: 'completed' | 'error'
  readonly title: string
  readonly detail: string
  readonly close: string
}
