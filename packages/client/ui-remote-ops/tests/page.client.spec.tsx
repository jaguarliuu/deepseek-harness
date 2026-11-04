// @vitest-environment jsdom
/** Connection form and AI handoff behavior with no SSH or model network calls. */
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { expect, it, vi, afterEach } from 'vitest'
import { OpsPage, type OpsFace } from '../src/client/page.tsx'
import { en } from '../src/client/locales.ts'
import { createTerminalStore } from '../src/client/store.ts'
import type { ServerView, ServerId } from '../src/types.ts'
vi.mock('../src/client/terminal.tsx', () => ({ SshTerminal: () => null }))
afterEach(cleanup)
function fixture(servers: ServerView[] = []) {
  const store = createTerminalStore().create()
  const face: OpsFace = {
    list: vi.fn(async () => servers),
    probe: vi.fn(async () => ({ ok: true, code: 'probed', fingerprint: `SHA256:${'A'.repeat(43)}` })),
    save: vi.fn(async () => ({ ok: true, code: 'saved' })),
    test: vi.fn(async () => ({ ok: true, code: 'tested' })),
    remove: vi.fn(async () => ({ ok: true, code: 'removed' })),
    connect: vi.fn(),
    read: vi.fn(),
    write: vi.fn(),
    disconnect: vi.fn(),
    ask: vi.fn(),
  }
  const props: Partial<Parameters<typeof OpsPage>[0]> = {
    ...face,
    t: key => (key in en ? en[key as keyof typeof en] : key),
    useStore: selector => selector(store.getSnapshot()),
    actions: store.actions,
  }
  render(<OpsPage {...(props as Parameters<typeof OpsPage>[0])} />)
  return face
}
it('requires a read and explicitly confirmed host fingerprint before enabling save', async () => {
  const face = fixture()
  fireEvent.click((await screen.findAllByRole('button', { name: en.add }))[0]!)
  const save = screen.getByRole('button', { name: en.save }) as HTMLButtonElement
  expect(save.disabled).toBe(true)
  fireEvent.change(screen.getByLabelText(en.host), { target: { value: '10.0.0.12' } })
  fireEvent.click(screen.getByRole('button', { name: en.probe }))
  await screen.findByText(`SHA256:${'A'.repeat(43)}`)
  expect(save.disabled).toBe(true)
  fireEvent.click(screen.getByLabelText(en.trust))
  await waitFor(() => {
    expect(save.disabled).toBe(false)
  })
  fireEvent.change(screen.getByLabelText(en.host), { target: { value: '10.0.0.13' } })
  expect(save.disabled).toBe(true)
  expect(face.save).not.toHaveBeenCalled()
})
it('opens a conversation draft for inspection without connecting or executing a command', async () => {
  const server: ServerView = {
    id: 'd2120839-ad18-493c-9d0b-16573b9517c2' as ServerId,
    name: 'Test server',
    group: 'Internal',
    host: '10.0.0.12',
    port: 22,
    username: 'employee',
    auth: 'password',
    fingerprint: `SHA256:${'A'.repeat(43)}`,
  }
  const face = fixture([server])
  const inspect = await screen.findByRole('button', { name: en.inspect })
  await waitFor(() => {
    expect((inspect as HTMLButtonElement).disabled).toBe(false)
  })
  fireEvent.click(inspect)
  expect(face.ask).toHaveBeenCalledWith(expect.stringContaining(server.id))
  expect(face.connect).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: en.analyze }).hasAttribute('disabled')).toBe(true)
})

it('reads a selected private key file without displaying its contents and sends it only to local save', async () => {
  const face = fixture()
  fireEvent.click((await screen.findAllByRole('button', { name: en.add }))[0]!)
  fireEvent.change(screen.getByLabelText(en.auth), { target: { value: 'key' } })
  expect(screen.queryByRole('textbox', { name: en.password })).toBeNull()
  expect(document.querySelector('textarea')).toBeNull()
  const contents = 'private-key-file-contents-never-display'
  const file = new File([contents], 'id_ed25519')
  Object.defineProperty(file, 'text', { value: () => Promise.resolve(contents) })
  fireEvent.change(screen.getByLabelText(en.keyFile), { target: { files: [file] } })
  await screen.findByText('id_ed25519')
  expect(screen.queryByText(contents)).toBeNull()
  expect(screen.queryByDisplayValue(contents)).toBeNull()
  fireEvent.change(screen.getByLabelText(en.host), { target: { value: '10.0.0.12' } })
  fireEvent.click(screen.getByRole('button', { name: en.probe }))
  await screen.findByText(`SHA256:${'A'.repeat(43)}`)
  fireEvent.click(screen.getByLabelText(en.trust))
  fireEvent.click(screen.getByRole('button', { name: en.save }))
  await waitFor(() => {
    expect(face.save).toHaveBeenCalledWith(expect.objectContaining({ auth: 'key', secret: contents }))
  })
  expect(face.ask).not.toHaveBeenCalled()
})
it('rejects oversized key files before reading and clears key contents when switching authentication', async () => {
  fixture()
  fireEvent.click((await screen.findAllByRole('button', { name: en.add }))[0]!)
  fireEvent.change(screen.getByLabelText(en.auth), { target: { value: 'key' } })
  const file = new File(['x'.repeat(65537)], 'large.key')
  const read = vi.fn(() => Promise.resolve('should-not-read'))
  Object.defineProperty(file, 'text', { value: read })
  fireEvent.change(screen.getByLabelText(en.keyFile), { target: { files: [file] } })
  await screen.findByText(en.keyFileSize)
  expect(read).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText(en.auth), { target: { value: 'password' } })
  expect(screen.getByLabelText<HTMLInputElement>(en.password).value).toBe('')
})
