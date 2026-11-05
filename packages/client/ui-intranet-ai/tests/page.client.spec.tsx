// @vitest-environment jsdom
/** The built-in platform needs account authorization, not endpoint configuration or a health probe. */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SettingsFormScopeSnapshot } from '@deepseek-ai/dsh-client-ui-primitives'
import { AiPage, type AiFace } from '../src/client/page.tsx'
import { en } from '../src/client/locales.ts'
import type { AiCatalogSettings } from '../src/types.ts'
afterEach(cleanup)
function fixture() {
  const value = { imageModels: ['internal-image'], voices: ['vivian'] }
  const snapshot: SettingsFormScopeSnapshot<AiCatalogSettings> = {
    status: 'ready',
    value,
    base: value,
    user: {},
    writable: true,
    revision: 1,
  }
  const run = vi.fn(async () => ({ ok: false, code: 'certificate' }))
  const save = vi.fn(async () => true)
  const face: Omit<AiFace, 'hooks'> = {
    save,
    run,
    account: async () => ({ connected: false, account: '' }),
    list: async () => [],
    submit: vi.fn(),
    artifact: vi.fn(),
  }
  const props: Partial<Parameters<typeof AiPage>[0]> = {
    ...face,
    t: key => (key in en ? en[key as keyof typeof en] : key),
    useConfiguration: selector => selector(snapshot),
  }
  render(<AiPage {...(props as Parameters<typeof AiPage>[0])} />)
  return { run, save }
}
it('authorizes immediately without an editable platform address, save or test prerequisite', async () => {
  const { run, save } = fixture()
  expect(screen.queryByLabelText('Platform address')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Test network' })).toBeNull()
  fireEvent.change(screen.getByLabelText(en.account), { target: { value: 'employee' } })
  fireEvent.change(screen.getByLabelText(en.password), { target: { value: 'local-password' } })
  fireEvent.click(screen.getByRole('button', { name: en.login }))
  await waitFor(() => {
    expect(run).toHaveBeenCalledWith('login', 'employee', 'local-password')
  })
  expect(save).not.toHaveBeenCalled()
  await screen.findByText(en.certificate)
  expect(screen.getByLabelText<HTMLInputElement>(en.password).value).toBe('')
})
