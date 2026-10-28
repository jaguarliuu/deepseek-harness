// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { ConnectionTest } from '../src/client/ConnectionTest.tsx'
import { CustomProviderCard } from '../src/client/CustomProviderCard.tsx'
import type { ModelsOperations } from '../src/client/operations.ts'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
const t = (key: keyof typeof en): string => en[key]
const testConnection = vi.fn(async () => undefined)
const writeSettings = vi.fn()
const operations: ModelsOperations = {
  testConnection,
  storeCredential: vi.fn(async () => undefined),
  removeCredential: vi.fn(async () => undefined),
  writeSettings,
  discoverModels: vi.fn(),
}
it('tests the selected draft and invalidates success after the address changes', async () => {
  const props = { operations, t, models: ['one', 'two'], settingsNs: 'llm-pi-ai', disabled: false, onBusyChange: vi.fn(), request: { baseURL: 'http://intranet/v1', api: 'openai-completions', model: 'one', noAuth: true } }
  const view = render(<ConnectionTest {...props} />)
  fireEvent.change(screen.getByLabelText(en.testModel), { target: { value: 'two' } })
  fireEvent.click(screen.getByRole('button', { name: en.testConnection }))
  await screen.findByText(en.connectionSuccess)
  expect(testConnection).toHaveBeenCalledWith('llm-pi-ai', { ...props.request, model: 'two' })
  expect(writeSettings).not.toHaveBeenCalled()
  view.rerender(<ConnectionTest {...props} request={{ ...props.request, baseURL: 'http://changed/v1' }} />)
  expect(screen.queryByText(en.connectionSuccess)).toBeNull()
})
it('reports authentication failure while retaining the form', async () => {
  render(<ConnectionTest operations={{ ...operations, testConnection: async () => 'HTTP 401' }} t={t} models={['m']} settingsNs="llm-pi-ai" disabled={false} onBusyChange={() => {}}
    request={{ baseURL: 'http://intranet/v1', api: 'openai-completions', model: 'm', apiKey: 'bad' }} />)
  fireEvent.click(screen.getByRole('button', { name: en.testConnection }))
  await screen.findByText(en.connectionAuthFailed)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: en.testConnection }).disabled).toBe(false)
})
it('saves explicit no-key mode without storing a typed key', async () => {
  const writeSettings = vi.fn(async () => ({ kind: 'refused' as const, message: 'captured' }))
  const storeCredential = vi.fn(async () => undefined)
  render(<CustomProviderCard taken={[]} protocols={['openai-completions']} reasoningLevels={[]} revision={1} t={t} readOnly={false} onClose={() => {}}
    operations={{ ...operations, writeSettings, storeCredential }} />)
  fireEvent.change(screen.getByLabelText(en.customRoute), { target: { value: 'private' } })
  fireEvent.change(screen.getByLabelText(en.baseUrl), { target: { value: 'http://intranet/v1' } })
  fireEvent.change(screen.getByLabelText(en.keyInput), { target: { value: 'do-not-store' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.click(screen.getByRole('button', { name: en.addModel }))
  fireEvent.change(screen.getByLabelText(`${en.modelId} 1`), { target: { value: 'm' } })
  fireEvent.click(screen.getByRole('button', { name: en.create }))
  await waitFor(() =>{  expect(writeSettings).toHaveBeenCalled() })
  expect(writeSettings.mock.calls[0]).toMatchObject(['llm-pi-ai', [{ value: { noAuth: true, baseURL: 'http://intranet/v1' } }], 1])
  expect(JSON.stringify(writeSettings.mock.calls)).not.toContain('do-not-store')
  expect(storeCredential).not.toHaveBeenCalled()
})
