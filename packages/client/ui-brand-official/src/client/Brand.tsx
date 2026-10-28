import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'
import css from './Brand.module.css'

/**
 * Render the approved safety-helmet robot at the requested size.
 * @param props - Host-supplied mark presentation.
 * @returns decorative product mark.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  return <span className={css.mark} style={{ width: size, height: size }} aria-hidden="true" />
}

/**
 * Render the product name beside the independently slotted mark.
 * @returns product wordmark.
 */
export function OfficialBrandName() {
  return <span className={css.name}>{process.env.DSH_CLIENT_TITLE ?? '智维小 C'}</span>
}
