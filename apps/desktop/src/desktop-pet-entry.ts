/** Packaged Electron dispatches the pet only to its immutable installed helper. */
import { join } from 'node:path'

/**
 * Select the installed helper without accepting an arbitrary script from argv.
 * @param argv - Application arguments.
 * @param packaged - Whether Electron loaded an installed application.
 * @param resources - Electron's installed resources directory.
 * @returns The fixed helper path, or undefined for the main application.
 */
export function desktopPetEntry(argv: readonly string[], packaged: boolean, resources: string): string | undefined {
  return packaged && argv.includes('--zhiwei-pet-helper')
    ? join(resources, 'pet', 'runtime', 'electron-helper', 'main.js') : undefined
}
