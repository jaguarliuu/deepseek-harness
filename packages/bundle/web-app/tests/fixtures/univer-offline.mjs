/** Exercise published Univer workers and native Office exports without a model or Internet. */
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { readFile, realpath } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { unzipSync } from 'fflate'

const require = createRequire(new URL('../../package.json', import.meta.url))
const { Context } = require('@deepseek-ai/cordis')
const root = dirname(require.resolve('dsh-univer-office/package.json'))
const plugin = await import(pathToFileURL(require.resolve('dsh-univer-office')).href)
const workspace = await realpath(process.env.DSH_HOME)
const scoped = { workspace, file: join(workspace, 'office.univer') }
const originalFetch = globalThis.fetch
let externalRequests = 0
// This isolated child owns its global fetch; reject any external transport before dispatch.
globalThis.fetch = (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input))
  if (url.hostname !== '127.0.0.1') {
    externalRequests++
    throw new Error('Unexpected external request')
  }
  return originalFetch(input, init)
}
const gateway = spawn(process.execPath, [join(root, 'artifacts/gateway.cjs')], {
  env: { ...process.env, UNIVER_COLLAB_GATEWAY_PORT: '0', UNIVER_VIEW_ASSETS_ROOT: join(root, 'artifacts/viewer') },
  stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
})
const exited = once(gateway, 'exit')
const ctx = new Context()
let service
let stderr = ''
let forced = false
gateway.stderr.on('data', bytes => { stderr = (stderr + String(bytes)).slice(-4000) })
try {
  const origin = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Gateway readiness timed out: ' + stderr)), 15000)
    let stdout = ''
    gateway.once('error', error => { clearTimeout(timer); reject(error) })
    gateway.once('exit', () => { clearTimeout(timer); reject(new Error('Gateway exited before readiness: ' + stderr)) })
    gateway.stdout.on('data', bytes => {
      stdout += String(bytes)
      const found = stdout.match(/listening on (http:\/\/127\.0\.0\.1:\d+)/u)
      if (found) { clearTimeout(timer); resolve(found[1]) }
    })
  })
  assert.equal((await fetch(origin)).status, 200)
  class FixtureService extends plugin.GatewayUniverService {
    // The fixture owns a Gateway bound atomically to port zero; all file/worker operations remain real.
    ensureGateway() { return Promise.resolve({ ok: true, gateway: origin, reused: true }) }
  }
  service = new FixtureService(ctx, plugin.resolveConfig({
    telemetry: false, resourceCacheRoot: join(workspace, 'resource-cache'), unitContentRuntimeMaxEntries: 0,
  }))
  assert.equal(plugin.resolveConfig().resourceDownloads, false)
  await service.newFile(scoped)
  const draft = await service.worktree({ ...scoped, action: 'create', name: '离线办公' })
  const worktreeId = draft.result.worktreeId
  const exports = []
  for (const kind of ['sheet', 'doc', 'slide']) {
    const made = await service.unit({ ...scoped, action: 'create', worktreeId, kind, name: '智维小 C' })
    const unitId = made.result.unitId
    const code = kind === 'sheet'
      ? 'workbook.getActiveSheet().getRange("A1:B2").setValues([["设备","状态"],["主机A","正常"]]); return workbook.getActiveSheet().getRange("A1:B2").getValues();'
      : kind === 'doc' ? 'doc.appendParagraph("智维小 C 离线报告"); return doc.getBody().dataStream;' : undefined
    if (code) {
      const written = await service.executeUnitContent({ ...scoped, worktreeId, unitId, code })
      assert.equal(written.result.committed, true)
      if (kind === 'sheet') assert.deepEqual(written.result.value, [['设备', '状态'], ['主机A', '正常']])
      else assert.match(written.result.value, /智维小 C 离线报告/u)
    }
    const extension = { sheet: 'xlsx', doc: 'docx', slide: 'pptx' }[kind]
    const output = join(workspace, `report.${extension}`)
    const exported = await service.exportUnitContent({ ...scoped, worktreeId, unitId, outputWorkspace: workspace, output })
    assert.equal(exported.ok, true)
    const parts = unzipSync(await readFile(output))
    const entry = { sheet: 'xl/workbook.xml', doc: 'word/document.xml', slide: 'ppt/presentation.xml' }[kind]
    assert(parts[entry], `${extension} must contain its Office document part`)
    if (kind === 'doc') assert.match(Buffer.from(parts[entry]).toString(), /智维小 C 离线报告/u)
    exports.push(extension)
  }
  const found = await service.resources({ action: 'find', queries: ['cloud'], limit: 1 })
  assert(found.result.resources.length)
  await assert.rejects(service.resources({ action: 'read', handle: found.result.resources[0].handle }), error => {
    assert.match(error.message, /resource downloads are disabled/u)
    return true
  })
  assert.equal(externalRequests, 0)
  const defaultExternalRequests = externalRequests
  const optedIn = new FixtureService(ctx.isolate('univer'), plugin.resolveConfig({
    telemetry: false, resourceDownloads: true, resourceCacheRoot: join(workspace, 'opt-in-cache'),
  }))
  await assert.rejects(optedIn.resources({ action: 'read', handle: found.result.resources[0].handle }), /Unexpected external request/u)
  assert.equal(externalRequests, 1)
  const providers = []
  plugin.apply({ plugin(child) {
    if (child.name === 'univer-skills') child.apply({ skills: { registerProvider(factory) { providers.push(factory()) } } })
  } }, { telemetry: false })
  const skills = (await providers[0].list()).map(skill => skill.name)
  assert(!skills.some(name => name === 'office' || name.startsWith('office-')))
  assert(skills.includes('univer-sheet') && skills.includes('univer-doc') && skills.includes('univer-slide'))
  console.log('UNIVER_RESULT=' + JSON.stringify({ exports, skills, externalRequests: defaultExternalRequests, optInTransportBlocked: externalRequests === 1, resourceDownloads: false }))
} finally {
  try { await ctx.fiber.dispose() }
  finally {
    if (gateway.exitCode === null && gateway.signalCode === null) gateway.kill('SIGTERM')
    const timer = setTimeout(() => { forced = true; gateway.kill('SIGKILL') }, 3000)
    try { await exited } finally { clearTimeout(timer) }
    globalThis.fetch = originalFetch
  }
}
assert.equal(forced, false)
assert(gateway.exitCode !== null || gateway.signalCode !== null)
