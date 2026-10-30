/** Keyless round trips through the task form, skill importer and recycle bin. */
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'
import { expect, it } from 'vitest'
import { SessionId } from '@deepseek-ai/dsh-session'
import { captureStableAria, compareOrRefreshGolden, launchWebScaffold, seedSession, webSnapshotMode } from './scaffold.ts'
import { newEnglishPage } from './support.ts'

it('creates a task, imports a skill and restores a recycled Session over the real remote transport', async () => {
  const scaffold = await launchWebScaffold()
  const browser = await chromium.launch()
  try {
    const id = SessionId('zhiwei-workflows')
    await seedSession(scaffold, await readFile(fileURLToPath(new URL('../../../snapshots/web/seeded-history/session.v3.jsonl', import.meta.url)), 'utf8'), id)
    const page = await newEnglishPage(browser)
    await page.goto(scaffold.authenticatedUrl)
    await page.getByRole('button', { name: 'Automation tasks', exact: true }).click()
    await page.getByRole('button', { name: 'New', exact: true }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Automation task name', { exact: true }).fill('Inspect database')
    await dialog.getByLabel('Automation task instruction', { exact: true }).fill('Inspect database health')
    await dialog.getByRole('combobox').first().selectOption(id)
    await dialog.getByLabel('Time zone', { exact: true }).fill('Asia/Shanghai')
    await compareOrRefreshGolden(
      fileURLToPath(new URL('./expected/zhiwei-task-create.expected.md', import.meta.url)),
      await captureStableAria(page, '[role="dialog"]', scaffold.workspaceCwd), webSnapshotMode(),
    )
    await dialog.getByRole('button', { name: 'Create task', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.getByText('Inspect database', { exact: true }).first().waitFor()
    const tasks = await scaffold.ctx.schedule.list({ sessionId: id })
    expect(tasks).toHaveLength(1)
    await scaffold.ctx.schedule.delete({ sessionId: id, id: tasks[0]!.id })

    await page.getByRole('button', { name: /Capabilities|Plugins|Capability center/u }).first().click()
    await page.getByRole('tab', { name: 'Browse', exact: true }).click()
    await page.getByRole('button', { name: 'Import skill', exact: true }).click()
    await page.getByLabel('Import SKILL.md', { exact: true }).setInputFiles({
      name: 'SKILL.md', mimeType: 'text/markdown',
      buffer: Buffer.from('---\nname: intranet-report\ndescription: Internal report writing\n---\nWrite a concise report.\n'),
    })
    await page.getByText('Skill imported. Refresh the catalog to view it.', { exact: true }).waitFor()
    await page.getByRole('dialog').getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByText('intranet-report', { exact: true }).waitFor()

    const group = page.getByRole('treeitem', { name: 'Ungrouped', exact: true })
    if (await group.getAttribute('aria-expanded') !== 'true') await group.click()
    const row = page.getByRole('treeitem').filter({ has: page.locator('button[aria-label^="Session actions for "]') }).first()
    await row.hover()
    await row.getByRole('button', { name: /^Session actions for /u }).click()
    await page.getByRole('menuitem', { name: 'Move to recycle bin', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Move to recycle bin', exact: true }).click()
    await expect.poll(() => scaffold.ctx.workspaceRegistry.trashedSessionIds).toContain(id)
    await page.reload()
    await page.getByRole('button', { name: 'Recycle bin', exact: true }).click()
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await expect.poll(() => scaffold.ctx.workspaceRegistry.trashedSessionIds).toEqual([])
    expect(scaffold.ctx.workspaceRegistry.archivedSessionIds).not.toContain(id)
    await scaffold.ctx.workspaceRegistry.trashSession(id)
    await page.getByRole('button', { name: 'Delete permanently', exact: true }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Delete permanently', exact: true }).click()
    await page.getByRole('alert').waitFor()
    expect(scaffold.ctx.workspaceRegistry.trashedSessionIds).toContain(id)
    expect(await scaffold.ctx.sessionPersistence.stat(id)).toBeDefined()
  } finally {
    await browser.close()
    await scaffold.close()
  }
}, 120_000)
