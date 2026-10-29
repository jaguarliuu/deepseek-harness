// @vitest-environment jsdom

import { cleanup, render } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { RunningWhaleTail } from '../src/client/chat/RunningWhaleTail.tsx'

afterEach(cleanup)

it('keeps running artwork decorative without the former whale SVG', () => {
  const view = render(<RunningWhaleTail />)
  expect(view.container.firstElementChild?.getAttribute('aria-hidden')).toBe('true')
  expect(view.container.querySelector('svg')).toBeNull()
  expect(view.container.querySelectorAll('span')).toHaveLength(2)
})
