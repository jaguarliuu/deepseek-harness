// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { makeTranslate } from '@deepseek-ai/dsh-client-test-runtime'
import { SessionId } from '@deepseek-ai/dsh-session/types'
import { SkillImport } from '../src/client/SkillImport.tsx'
import { en } from '../src/client/locales.ts'

afterEach(cleanup)
it('uploads selected instructions and refreshes the catalog after success', async () => {
  const onImportSkill = vi.fn(async () => ({ name: 'office-report' }))
  const onImported = vi.fn()
  render(<SkillImport sessionId={SessionId('office')} onImportSkill={onImportSkill} onImported={onImported} t={makeTranslate(en)} />)
  fireEvent.click(screen.getByRole('button', { name: en['import.action'] }))
  const content = '---\nname: office-report\ndescription: Reports\n---\nWrite a report.'
  const file = new File([content], 'SKILL.md', { type: 'text/markdown' })
  Object.defineProperties(file, {
    arrayBuffer: { value: async () => new TextEncoder().encode(content).buffer },
    webkitRelativePath: { value: '' },
  })
  fireEvent.change(screen.getByLabelText(en['import.file']), { target: { files: [file] } })
  await waitFor(() =>{  expect(onImported).toHaveBeenCalledOnce() })
  expect(onImportSkill).toHaveBeenCalledWith({ sessionId: 'office', files: [{ path: 'SKILL.md', base64: btoa(content) }] })
  expect(screen.getByRole('status').textContent).toBe(en['import.success'])
})
it('disables importing until a workspace Session is selected', () => {
  render(<SkillImport sessionId={undefined} onImportSkill={vi.fn()} onImported={vi.fn()} t={makeTranslate(en)} />)
  expect(screen.getByRole<HTMLButtonElement>('button', { name: en['import.action'] }).disabled).toBe(true)
})
