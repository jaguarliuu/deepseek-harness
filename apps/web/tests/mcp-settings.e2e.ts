/** MCP settings persist connections and expose real tool discovery through the Host. */
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { it, expect } from 'vitest'
import { launchWebScaffold, captureStableAria, compareOrRefreshGolden, webSnapshotMode } from './scaffold.ts'
import { newEnglishPage, openSettings } from './support.ts'
import { startHttpMcpFixture } from '../../../packages/client/ui-mcp/tests/http-fixture.ts'

it('tests, saves, disables and removes an MCP service', async () => {
  const scaffold = await launchWebScaffold()
  const http = await startHttpMcpFixture()
  const browser = await chromium.launch()
  try {
    const page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl)
    await openSettings(page, 'en')
    await page.getByRole('button', { name: 'MCP services', exact: true }).click()
    await page.getByRole('button', { name: 'Add service', exact: true }).click()
    const editor = page.getByRole('dialog', { name: 'Add service', exact: true })
    await editor.getByLabel('Service name', { exact: true }).fill('intranet')
    await editor.getByLabel('MCP endpoint', { exact: true }).fill(http.url)
    await editor.getByRole('button', { name: 'Test connection', exact: true }).click()
    await editor.getByRole('status').or(editor.getByRole('alert')).waitFor()
    expect(await editor.innerText()).toContain('ping')
    expect(http.calls).toEqual([])
    // Use a stable endpoint in the captured editor after verifying the live one.
    await editor.getByLabel('MCP endpoint', { exact: true }).fill('http://intranet.example/mcp')
    await compareOrRefreshGolden(fileURLToPath(new URL('./expected/mcp-settings.expected.md', import.meta.url)),
      await captureStableAria(page, '[role="dialog"][aria-label="Add service"]', scaffold.workspaceCwd), webSnapshotMode())
    await editor.getByLabel('MCP endpoint', { exact: true }).fill(http.url)
    await editor.getByRole('button', { name: 'Save service', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    await page.getByRole('heading', { name: 'intranet', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Disable', exact: true }).click()
    await page.getByRole('button', { name: 'Enable', exact: true }).waitFor()
    await page.reload()
    await openSettings(page, 'en')
    await page.getByRole('button', { name: 'MCP services', exact: true }).click()
    await page.getByRole('button', { name: 'Enable', exact: true }).waitFor()
    await page.getByRole('button', { name: 'Remove', exact: true }).click()
    await page.getByRole('dialog', { name: 'Remove service', exact: true }).getByRole('button', { name: 'Remove', exact: true }).click()
    await page.getByText('No services configured', { exact: true }).waitFor()
  } finally { await browser.close(); await scaffold.close(); await http.close() }
}, 120000)
