import { describe, expect, it, vi } from 'vitest'
import { stubConfigForm } from '@deepseek-ai/dsh-client-test-runtime'
import { sourceAddress, sourceForm, type SourceSettings } from '../src/client/source-settings.ts'

describe('intranet sources', () => {
  it('normalizes paths and rejects non-HTTP URLs and embedded credentials', () => {
    expect(sourceAddress(' https://packages.example/simple ')).toBe('https://packages.example/simple/')
    for (const value of ['file:///tmp/packages', 'https://user:secret@packages.example', 'https://packages.example/?token=x', 'not a URL']) {
      expect(sourceAddress(value)).toBeUndefined()
    }
    expect(sourceAddress('')).toBe('')
  })

  it('saves the npm source and clears public fallbacks in one revision-fenced write', async () => {
    const host = stubConfigForm<SourceSettings>()
    host.publish({ status: 'ready', writable: true, value: {}, revision: 4 })
    const form = sourceForm(host.scope, 'npm')
    form.actions().edit('registry', 'https://npm.example')
    form.actions().save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalledWith([
      { op: 'set', path: ['registry'], value: 'https://npm.example/' },
      { op: 'set', path: ['fallbackRegistries'], value: [] },
    ], 4) })
    form.dispose()
  })

  it('writes only the Python index environment key and retains a rejected draft', async () => {
    const host = stubConfigForm<SourceSettings>()
    host.publish({ status: 'ready', writable: true, value: { environment: { KEEP: 'value', PIP_INDEX_URL: 'https://old.example/simple/' } }, revision: 8 })
    host.mutate.mockResolvedValue(false)
    const form = sourceForm(host.scope, 'python')
    expect(form.field('registry').text).toBe('https://old.example/simple/')
    form.actions().edit('registry', 'https://pypi.example/simple/')
    form.actions().save()
    await vi.waitFor(() => { expect(form.shell().failed).toBe(true) })
    expect(host.mutate).toHaveBeenCalledWith([{ op: 'set', path: ['environment', 'PIP_INDEX_URL'], value: 'https://pypi.example/simple/' }], 8)
    expect(form.field('registry').text).toBe('https://pypi.example/simple/')
    form.dispose()
  })

  it('resets Python without deleting unrelated environment entries', async () => {
    const host = stubConfigForm<SourceSettings>()
    host.publish({ status: 'ready', writable: true, value: { environment: { PIP_INDEX_URL: 'https://old.example/' } }, user: { environment: { PIP_INDEX_URL: 'https://old.example/' } } })
    const form = sourceForm(host.scope, 'python')
    form.actions().resetField('registry')
    form.actions().save()
    await vi.waitFor(() => { expect(host.mutate).toHaveBeenCalledWith([{ op: 'unset', path: ['environment', 'PIP_INDEX_URL'] }], undefined) })
    form.dispose()
  })
})
