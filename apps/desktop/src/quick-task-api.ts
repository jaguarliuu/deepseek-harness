/** Shell-owned compact task presentation; task execution remains in the shared conversation. */
import type { DesktopMessages } from './locale.ts'

/** Only the owned application frame can invoke these channels. */
export const QUICK_TASK_IPC = {
  phase: 'quick-task:phase', status: 'quick-task:status', action: 'quick-task:action', changed: 'quick-task:changed', command: 'quick-task:command',
} as const
/** Current shell presentation, with locale-owned toolbar copy. */
export interface QuickTaskView {
  readonly active: boolean
  readonly messages: Pick<DesktopMessages, 'quickTaskTitle' | 'quickTaskHint' | 'quickTaskNew' | 'quickTaskExpand' | 'quickTaskHide'>
}
