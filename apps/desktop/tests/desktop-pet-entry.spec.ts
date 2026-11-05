import { expect, it } from 'vitest'
import { join } from 'node:path'
import { desktopPetEntry } from '../src/desktop-pet-entry.ts'

it('dispatches packaged helpers to the installed script and ignores an argv script path', () => {
  expect(desktopPetEntry(['app.exe', '/untrusted/script.js', '--zhiwei-pet-helper'], true, '/resources'))
    .toBe(join('/resources', 'pet/runtime/electron-helper/main.js'))
})
it('keeps ordinary and unpackaged launches on the normal application entry', () => {
  expect(desktopPetEntry(['app.exe'], true, '/resources')).toBeUndefined()
  expect(desktopPetEntry(['electron', '--zhiwei-pet-helper'], false, '/resources')).toBeUndefined()
})
