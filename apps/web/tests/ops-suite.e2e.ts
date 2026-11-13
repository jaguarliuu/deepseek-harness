/** Exercise the delivered archive through a managed profile, including SSH setup and collection. */
import { execFileSync } from 'node:child_process'
import { mkdtemp, realpath, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-client-ui-ops-monitor'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, revealNavigationDrawer } from './support.ts'

it('loads both features from one archive and configures SSH before collecting charts', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'ops-suite-delivery-'))
  onTestFinished(() => rm(directory, { recursive: true, force: true }))
  const archive = fileURLToPath(new URL('../../../output/ops-suite/ops-suite-0.2.2-rc.2.zip', import.meta.url))
  execFileSync('unzip', ['-q', archive, '-d', directory])
  const bundle = await realpath(join(directory, 'ops-suite'))
  const scaffold = await launchWebScaffold({ extraInstallAnchors: [join(bundle, 'package.json')], profile: { hmr: false, packages: [], bundles: ['@intranet/dsh-ops-suite'] } })
  onTestFinished(() => scaffold.close())
  const rows = [...scaffold.ctx.loader.entries()]
  expect(rows.find(row => row.options.id === 'ui-remote-ops')?.options.disabled).toBe(true)
  for (const [id, name] of [['ops-suite-ssh', 'ui-remote-ops'], ['ops-suite-monitor', 'ui-ops-monitor']]) {
    const row = rows.find(entry => entry.options.id === id)
    expect(row).toBeDefined()
    expect(row!.options.disabled ?? false).toBe(false)
    const resolved = scaffold.ctx.pluginPackages.packageOf(`@deepseek-ai/dsh-client-${name}`, pathToFileURL(join(bundle, 'index.js')).href)
    expect(resolved?.dir).toBe(join(bundle, 'node_modules', '@deepseek-ai', `dsh-client-${name}`))
  }
  const fingerprint = `SHA256:${'A'.repeat(43)}`
  const probe = vi.spyOn(scaffold.ctx.remoteOps.connections, 'probe').mockResolvedValue(fingerprint)
  const execute = vi.spyOn(scaffold.ctx.remoteOps.connections, 'execute').mockImplementation(async (_server, script) => ({
    output: script.includes('df -Pk') ? 'disk_percent\t72\t%\t/\n' : 'cpu_percent\t24.5\t%\t-\nmemory_percent\t61\t%\t-\nload_1m\t1.2\tload\t-\nuptime_seconds\t3600\ts\t-\n',
    exitCode: 0, interrupted: false, truncated: false,
  }))
  onTestFinished(() => { probe.mockRestore(); execute.mockRestore() })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Manage SSH servers', exact: true }).click()
  await page.getByRole('button', { name: 'Add server', exact: true }).first().click()
  await page.getByLabel('Name', { exact: true }).fill('Intranet Linux')
  await page.getByLabel('Host', { exact: true }).fill('192.0.2.10')
  await page.getByLabel('Username', { exact: true }).fill('monitor')
  await page.getByLabel('Password', { exact: true }).fill('fixture-only-secret')
  await page.getByRole('button', { name: 'Read host fingerprint', exact: true }).click()
  await page.getByText(fingerprint, { exact: true }).waitFor()
  await page.getByLabel('I verified this fingerprint through a trusted channel', { exact: true }).check()
  await page.getByRole('button', { name: 'Save locally', exact: true }).click()
  await expect.poll(async () => (await scaffold.ctx.remoteOps.list()).length).toBe(1)
  const server = (await scaffold.ctx.remoteOps.list())[0]!
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Monitor settings', exact: true }).click()
  await page.getByRole('button', { name: 'Enable monitoring', exact: true }).click()
  await page.getByLabel('Saved server', { exact: true }).selectOption(server.id)
  await page.getByRole('button', { name: 'Enable selected templates', exact: true }).click()
  await page.getByRole('heading', { name: 'CPU usage trends', exact: true }).waitFor()
  await page.getByText('24.5 %', { exact: true }).waitFor({ timeout: 75000 })
  expect(execute).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(await scaffold.ctx.opsMonitor.snapshot())).not.toContain('fixture-only-secret')
}, 120000)
