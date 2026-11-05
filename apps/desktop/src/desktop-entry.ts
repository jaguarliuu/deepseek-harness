/** Dispatch the installed executable before initializing shell windows or claiming its instance lock. */
import { app } from 'electron'
import { createRequire } from 'node:module'
import { desktopPetEntry } from './desktop-pet-entry.ts'

const helper = desktopPetEntry(process.argv, app.isPackaged, process.resourcesPath)
if (helper === undefined) await import('./main.ts')
else createRequire(import.meta.url)(helper)
