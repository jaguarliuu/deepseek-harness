/** Internal Desktop defaults stay below explicit user configuration. */
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import Loader, { type EntryOptions } from '@deepseek-ai/cordis-plugin-loader'
import { applyEntryPatches } from '@deepseek-ai/cordis-plugin-include'
import { loadOverlayPatches } from '@deepseek-ai/dsh-app-boot'
import { expect, it, onTestFinished, vi } from 'vitest'
import SystemPrompt, { renderPrompt } from '@deepseek-ai/dsh-system-prompt'

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


it.each(['desktop', 'web'])('assembles the product identity for %s through the shipped bundle', async (profile) => {
  const base = loadOverlayPatches('base', fileURLToPath(new URL('../../base/cordis.patch.yml', import.meta.url)))
    .flatMap(patch => patch.insert ?? [])
  const patches = loadOverlayPatches('web', fileURLToPath(new URL('../cordis.patch.yml', import.meta.url)))
  const rows = applyEntryPatches(base, patches, (message) => { throw new Error(message) })
    .filter(row => ['system-prompt', 'harness-dev-context'].includes(row.id))
  const ctx = new Context()
  onTestFinished(() => ctx.fiber.dispose())
  ctx.provide('profileContext', {
    name: profile, dir: '/profile', patchPath: '/profile/cordis.patch.yml', installAnchor: '/profile/package.json',
    cwd: '/workspace', home: '/home', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined,
  })
  ctx.baseUrl = 'file:///'
  await ctx.plugin(Loader).await()
  ctx.loader.builtins['system-prompt'] = SystemPrompt
  const devContext = vi.fn()
  ctx.loader.builtins['harness-dev-context'] = { apply: devContext }
  await ctx.loader.root.update(rows.map(row => ({ ...row, name: `cordis:${row.id}` })))
  await ctx.loader.await()
  ctx.effect(() => ctx.systemPrompt.variable('model', () => 'private-model'))
  for (const preset of ['standard', 'cordis', 'ptc', 'minimal']) {
    const declarations = loadOverlayPatches(preset, fileURLToPath(new URL(`../presets/${preset}.patch.yml`, import.meta.url)))
      .flatMap(patch => patch.insert ?? [])
    const { plugins } = declarations[0]!.config as { plugins: EntryOptions[] }
    const persona = plugins.find(row => row.id === 'persona')!
    const capture = vi.fn((_ctx: Context, _config: Record<string, unknown>) => {})
    ctx.loader.builtins.persona = { apply: capture }
    await ctx.loader.root.update([...rows.map(row => ({ ...row, name: `cordis:${row.id}` })),
      { ...persona, name: 'cordis:persona' }])
    await ctx.loader.await()
    expect(capture).toHaveBeenCalledOnce()
    if (profile === 'desktop') expect(capture.mock.calls[0]![1].prefix).toContain('智维小 C')
    if (preset === 'minimal') expect(capture.mock.calls[0]![1]).toMatchObject({ complete: true, includeRuntimeContext: false })
    await ctx.loader.root.update(rows.map(row => ({ ...row, name: `cordis:${row.id}` })))
    await ctx.loader.await()
  }
  const prompt = renderPrompt(await ctx.systemPrompt.assemble())
  if (profile === 'desktop') {
    expect(devContext).not.toHaveBeenCalled()
    expect(prompt).not.toMatch(/DeepSeek|DSH|coding agent/u)
    await expect(prompt).toMatchFileSnapshot('./expected/desktop-identity.txt')
  } else {
    expect(devContext).toHaveBeenCalledOnce()
    expect(prompt).toContain('You are an AI agent powered by DeepSeek Harness.')
    expect(prompt).toContain('You are a coding agent powered by the private-model model.')
  }
})
