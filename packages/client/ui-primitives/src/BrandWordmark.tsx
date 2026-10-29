import clsx from 'clsx'
import type { IconProps } from './icons/props.ts'
import { FishLogo } from './FishLogo.tsx'
import css from './ProductBrand.module.css'

/** Display options for the product wordmark. */
export interface BrandWordmarkProps extends IconProps {
  /** Localized product name supplied by the caller. */
  label: string
  /** Whether to include the leading product mark; defaults to true. */
  includeMark?: boolean | undefined
}

/**
 * Render the product name with optional rounded robot artwork.
 * @param props - Localized label, size and mark visibility.
 * @returns Decorative product wordmark.
 */
export function BrandWordmark({ size = 24, className, includeMark = true, label }: BrandWordmarkProps) {
  return <span className={clsx(css.wordmark, className)} style={{ fontSize: size }} aria-hidden="true">
    {includeMark && <FishLogo size={size} />}{label}
  </span>
}
