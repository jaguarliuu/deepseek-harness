import { expect, it, vi } from 'vitest'
import { join } from 'node:path'
const fixture = vi.hoisted(() => ({ load: vi.fn(), whenReady: vi.fn() }))
vi.mock('electron', () => ({ app: { isPackaged: true, whenReady: fixture.whenReady } }))
vi.mock('node:module', () => ({ createRequire: () => fixture.load }))

it('loads the installed helper before any shell readiness or single-instance initialization', async () => {
  const previous = process.argv
  const resources = Object.getOwnPropertyDescriptor(process, 'resourcesPath')
  Object.defineProperty(process, 'resourcesPath', { value: '/installed/resources', configurable: true })
  process.argv = ['zhiwei.exe', '--zhiwei-pet-helper', '/ignored/script.js']
  try {
    await import('../src/desktop-entry.ts')
    expect(fixture.load).toHaveBeenCalledWith(join(process.resourcesPath, 'pet/runtime/electron-helper/main.js'))
    expect(fixture.whenReady).not.toHaveBeenCalled()
  } finally {
    process.argv = previous
    if (resources) Object.defineProperty(process, 'resourcesPath', resources)
    else Reflect.deleteProperty(process, 'resourcesPath')
  }
})
