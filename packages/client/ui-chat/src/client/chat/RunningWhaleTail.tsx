/** Decorative product mark for an active task. */
import { FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import css from './ChatView.module.css'

/**
 * Render the running product mark with reduced-motion-aware emphasis.
 * @returns Decorative robot artwork.
 */
export function RunningWhaleTail() {
  return <span className={css.runningIcon} aria-hidden="true"><FishLogo size={16} /></span>
}
