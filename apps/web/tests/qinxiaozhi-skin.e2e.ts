/** Real profile installation, durable console controls, and rc1-era slot compatibility. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { expect, it, onTestFinished } from 'vitest'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, revealNavigationDrawer } from './support.ts'

const PLUGIN = fileURLToPath(new URL('../../../local-plugins/qinxiaozhi-skin', import.meta.url))
const SHOTS = fileURLToPath(new URL('../../../output/qinxiaozhi-skin', import.meta.url))

it('installs with a console, persists switching and works without the added sidebar markers', async () => {
  const scaffold = await launchWebScaffold({
    profile: { packages: [{ dir: PLUGIN, enabled: true }] },
  })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.setViewportSize({ width: 1440, height: 900 })
  await scaffold.ctx.settings.update('ui-theme', { preference: 'light' })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await page.locator('.qin-skin-welcome').waitFor({ timeout: 30_000 })
  await expect((await page.locator('.qin-skin-welcome').innerText()) + '\n').toMatchFileSnapshot('./expected/qinxiaozhi-welcome.expected.txt')
  const canvas = () => page.locator('body').evaluate(el => getComputedStyle(el).getPropertyValue('--dsw-alias-bg-base').trim())
  await expect.poll(canvas).toBe('#0d0d0f')
  expect(await page.locator('[data-composer-input]').count()).toBe(1)
  // These attributes were added only in the skin development tree; rc1 users do not have them.
  expect(await page.locator('[data-sidebar-section]').count()).toBe(0)
  expect(await page.locator('[data-slot="conversation.hero.content"]').count()).toBe(0)
  const workspaceRegion = page.locator('[data-sidebar-scrollport] > div:has(> [data-slot="sidebar.workspaces"])')
  const navigationRegion = page.locator('[data-sidebar-scrollport] > nav')
  const workspacesFirst = async () => {
    const workspace = await workspaceRegion.boundingBox()
    const navigation = await navigationRegion.boundingBox()
    return workspace !== null && navigation !== null && workspace.y + workspace.height <= navigation.y
  }
  await expect.poll(workspacesFirst).toBe(true)
  await mkdir(SHOTS, { recursive: true })
  await page.getByRole('button', { name: 'Skin console', exact: true }).click()
  const enabled = page.getByRole('switch', { name: 'Enable Qin Xiaozhi skin', exact: true })
  await enabled.waitFor()
  await expect.poll(() => enabled.getAttribute('aria-checked')).toBe('true')
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'console-en.png') })
  await page.route('**/api/settings/mutate', async (route) => {
    const request: unknown = route.request().postDataJSON()
    if (typeof request !== 'object' || request === null || !('rpcId' in request) || typeof request.rpcId !== 'string') {
      throw new Error('Expected a settings RPC request')
    }
    await route.fulfill({ json: { type: 'server-response', rpcId: request.rpcId, result: { ok: false,
      error: { code: 'settings/rejected', message: 'Test deployment refuses this write', details: { ns: 'qinxiaozhi-skin' } } } } })
  }, { times: 1 })
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: 'Settings could not be saved' }).waitFor()
  expect(await canvas()).toBe('#0d0d0f')
  await expect.poll(() => enabled.isEnabled()).toBe(true)

  await page.getByRole('switch', { name: 'Conversations above navigation actions', exact: true }).click()
  await expect.poll(() => enabled.isEnabled()).toBe(true)
  await expect.poll(workspacesFirst).toBe(false)
  await expect.poll(() => enabled.isEnabled()).toBe(true)
  await enabled.click()
  await expect.poll(() => page.locator('style[data-qin-skin]').count()).toBe(0)
  await expect.poll(canvas).not.toBe('#0d0d0f')
  expect(await page.getByRole('button', { name: 'Skin console', exact: true }).count()).toBe(1)
  await page.reload({ waitUntil: 'load' })
  await page.getByRole('button', { name: 'Skin console', exact: true }).click()
  await expect.poll(() => enabled.getAttribute('aria-checked')).toBe('false')
  await enabled.click()
  await expect.poll(canvas).toBe('#0d0d0f')
  await page.getByRole('button', { name: 'Light', exact: true }).click()
  await expect.poll(canvas).toBe('#f8faf9')
  await expect.poll(() => enabled.isEnabled()).toBe(true)
  await page.getByRole('switch', { name: 'Show Qin Xiaozhi welcome', exact: true }).click()
  await expect.poll(() => enabled.isEnabled()).toBe(true)
  await page.getByRole('button', { name: 'Back to conversation', exact: true }).click()
  expect(await page.locator('.qin-skin-welcome').count()).toBe(0)
  expect(await page.locator('[data-composer-input]').count()).toBe(1)
  await page.getByRole('button', { name: 'Skin console', exact: true }).click()
  await page.getByRole('button', { name: 'Restore skin defaults', exact: true }).click()
  await expect.poll(workspacesFirst).toBe(true)
  await expect.poll(canvas).toBe('#0d0d0f')
  await expect.poll(() => enabled.isEnabled()).toBe(true)
  await scaffold.ctx.settings.update('locale', { preference: 'zh' })
  await page.getByRole('heading', { name: '皮肤控制台', exact: true }).waitFor()
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'console.png') })
  await page.getByRole('button', { name: '返回对话', exact: true }).click()
  await page.locator('.qin-skin-welcome').waitFor()
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'dark.png') })
  await page.getByRole('button', { name: '收起侧边栏', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.locator('.qin-skin-welcome').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'narrow.png') })
  await revealNavigationDrawer(page, 'zh')
  await page.getByRole('button', { name: '皮肤控制台', exact: true }).click()
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'console-narrow.png') })
  await scaffold.ctx.pluginManager.setBundleEnabled('@intranet/dsh-skin-qinxiaozhi', false)
  await expect.poll(() => page.locator('style[data-qin-skin]').count()).toBe(0)
  await expect.poll(() => page.locator('style[data-qin-console]').count()).toBe(0)
})
