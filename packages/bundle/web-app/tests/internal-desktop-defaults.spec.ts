/** Internal Desktop defaults stay below explicit user configuration. */
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it, onTestFinished, vi } from 'vitest'

it.each(['desktop', 'web'])('resolves account, coding and upload defaults for %s', async (profile) => {
  vi.stubEnv('DSH_TELEMETRY_MODE', '')
  onTestFinished(() => { vi.unstubAllEnvs() })
  const selected = new Set(['ui-settings-account', 'ui-settings', 'session-log-deepseek', 'session-telemetry-otel'])
  const rows = ['../../base/cordis.patch.yml', '../cordis.patch.yml'].flatMap(path =>
    loadOverlayPatches('internal-defaults', fileURLToPath(new URL(path, import.meta.url)))
      .flatMap(patch => patch.insert ?? []).filter(row => selected.has(row.id)))
  expect(rows).toHaveLength(4)
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('profileContext', {
    name: profile, dir: '/profile', patchPath: '/profile/cordis.patch.yml', installAnchor: '/profile/package.json',
    cwd: '/workspace', home: '/home', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  })
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  const configurations = new Map<string, Record<string, unknown>>()
  for (const row of rows) {
    ctx.loader.builtins[row.id] = { apply: (_ctx: Context, config: Record<string, unknown>) => { configurations.set(row.id, config) } }
  }
  const entries = rows.map(row => ({ ...row, name: `cordis:${row.id}` }))
  await ctx.loader.root.update(entries)
  await ctx.loader.await()
  expect(ctx.loader.resolve('ui-settings-account').disabled).toBe(profile === 'desktop')
  expect(configurations.get('ui-settings')).toMatchObject({ enabled: profile !== 'desktop' })
  expect(configurations.get('session-log-deepseek')).toMatchObject({ enabled: profile !== 'desktop' })
  expect(configurations.get('session-telemetry-otel')).toMatchObject({ mode: profile === 'desktop' ? 'DISABLED' : 'FEEDBACK_ONLY' })

  const configured = applyEntryPatches(entries, [
    { id: 'ui-settings', config: { enabled: true } },
    { id: 'session-log-deepseek', config: { enabled: true } },
  ], (message) => { throw new Error(message) })
  await ctx.loader.root.update(configured)
  await ctx.loader.await()
  expect(configurations.get('ui-settings')).toMatchObject({ enabled: true })
  expect(configurations.get('session-log-deepseek')).toMatchObject({ enabled: true })
})

it('starts GUI profiles without public model defaults or credential onboarding', () => {
  const base = loadOverlayPatches('base', fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  const patches = loadOverlayPatches('web', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
  const rows = applyEntryPatches(base, patches, (message) => { throw new Error(message) })
  const row = (id: string) => rows.find(entry => entry.id === id)
  expect(row('llm-deepseek')?.disabled).toBe(true)
  expect(row('llm-deepseek-account')?.disabled).toBe(true)
  expect(row('agent-default-model')?.config).toEqual({ provider: '', model: '' })
  expect(row('ui-settings-models')?.config).toEqual({ credentialOnboarding: false })
  const saved = applyEntryPatches(rows, [{ id: 'agent-default-model', config: { provider: 'intranet', model: 'private-model' } }],
    (message) => { throw new Error(message) })
  expect(saved.find(entry => entry.id === 'agent-default-model')?.config).toEqual({ provider: 'intranet', model: 'private-model' })
})
