// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { TaskCreateDialog } from '../src/client/TaskCreateDialog.tsx'
import { en } from '../src/client/task-manager-locales.ts'

afterEach(cleanup)
it('saves a daily task with its Session and timezone and closes only after success', async () => {
  const onCreate = vi.fn(async () => {})
  const onClose = vi.fn()
  render(<TaskCreateDialog sessions={[{ id: SessionId('office'), title: 'Office' }]} onCreate={onCreate} onClose={onClose} t={makeTranslate(en)} />)
  fireEvent.change(screen.getByLabelText(en['detail.name']), { target: { value: 'Database inspection' } })
  fireEvent.change(screen.getByLabelText(en['detail.instruction']), { target: { value: 'Inspect databases' } })
  fireEvent.change(screen.getByLabelText(en['new.zone']), { target: { value: 'Asia/Shanghai' } })
  fireEvent.click(screen.getByRole('button', { name: en['new.save'] }))
  await waitFor(() =>{  expect(onClose).toHaveBeenCalledOnce() })
  expect(onCreate).toHaveBeenCalledWith('office', { title: 'Database inspection', prompt: 'Inspect databases', daily: { time: '09:00:00', time_zone: 'Asia/Shanghai' } })
})
it('keeps the draft after a rejected save and supports retry', async () => {
  const onCreate = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined)
  const onClose = vi.fn()
  render(<TaskCreateDialog sessions={[{ id: SessionId('office'), title: 'Office' }]} onCreate={onCreate} onClose={onClose} t={makeTranslate(en)} />)
  fireEvent.change(screen.getByLabelText(en['detail.name']), { target: { value: 'Report' } })
  fireEvent.change(screen.getByLabelText(en['detail.instruction']), { target: { value: 'Write report' } })
  fireEvent.click(screen.getByRole('button', { name: en['new.save'] }))
  await screen.findByRole('alert')
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByLabelText<HTMLInputElement>(en['detail.name']).value).toBe('Report')
  fireEvent.click(screen.getByRole('button', { name: en['new.save'] }))
  await waitFor(() =>{  expect(onClose).toHaveBeenCalledOnce() })
})
