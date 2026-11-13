/** Monitoring through the real profile, generated RPC and browser resource stream; only SSH responses are scripted. */
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'
import { expect, it, onTestFinished, vi } from 'vitest'
import type {} from '@deepseek-ai/dsh-client-ui-ops-monitor'
import { launchWebScaffold } from './scaffold.ts'
import { newEnglishPage, revealNavigationDrawer } from './support.ts'

const PACKAGE = fileURLToPath(new URL('../../../packages/client/ui-ops-monitor', import.meta.url))
const SHOTS = fileURLToPath(new URL('../../../output/ops-monitor', import.meta.url))
const health = 'cpu_percent\t24.5\t%\t-\nmemory_percent\t61\t%\t-\nload_1m\t1.2\tload\t-\nuptime_seconds\t3600\ts\t-\n'

it('enrolls, collects, queries, pauses and restores the monitoring dashboard', async () => {
  const scaffold = await launchWebScaffold({ extraInstallAnchors: [join(PACKAGE, 'package.json')] })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.setViewportSize({ width: 1440, height: 1000 })
  const server = await scaffold.ctx.remoteOps.repository.save({ name: 'Production Linux · primary node', group: 'Production',
    host: '127.0.0.1', port: 22, username: 'monitor', auth: 'password', secret: 'fixture-secret-never-in-results', passphrase: '', fingerprint: `SHA256:${'A'.repeat(43)}` })
  const execute = vi.spyOn(scaffold.ctx.remoteOps.connections, 'execute').mockImplementation(async (_server, script) => ({
    output: script.includes('df -Pk') ? 'disk_percent\t72\t%\t/\n' : health,
    exitCode: 0, interrupted: false, truncated: false,
  }))
  onTestFinished(() => { execute.mockRestore() })
  await scaffold.ctx.loader.create({ name: '@deepseek-ai/dsh-client-ui-ops-monitor', config: { intervalMs: 10000, streamIntervalMs: 1000, historyPoints: 2 } })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByRole('heading', { name: 'Connect your first server' }).waitFor()
  await page.getByRole('button', { name: 'Monitor settings', exact: true }).click()
  await page.getByRole('button', { name: 'Enable monitoring', exact: true }).click()
  await page.getByLabel('Saved server', { exact: true }).selectOption(server.id)
  await page.getByRole('button', { name: 'Enable selected templates' }).click()
  await page.getByRole('heading', { name: 'CPU usage trends' }).waitFor()
  const monitor = scaffold.ctx.opsMonitor
  const view = await monitor.snapshot()
  expect(view.monitors[0]?.enabled).toBe(true)
  expect(JSON.stringify(view)).not.toContain('fixture-secret')
  await page.getByText('24.5 %', { exact: true }).waitFor({ timeout: 75000 })
  expect(execute).toHaveBeenCalledTimes(2)
  await expect.poll(async () => (await monitor.snapshot()).monitors[0]?.samples.length, { timeout: 20000 }).toBe(2)
  await mkdir(SHOTS, { recursive: true })
  await scaffold.ctx.settings.update('locale', { preference: 'zh' })
  await page.getByRole('heading', { name: '运维大屏', exact: true }).waitFor()
  await page.getByRole('heading', { name: 'CPU 使用率趋势' }).waitFor()
  await scaffold.ctx.settings.update('ui-theme', { preference: 'dark' })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'dark.png') })
  await scaffold.ctx.settings.update('ui-theme', { preference: 'light' })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'light.png') })
  await page.getByRole('button', { name: '监控管理', exact: true }).click()
  await page.getByRole('button', { name: '暂停采集', exact: true }).click()
  await page.locator('[data-ops-monitor] [data-state=paused]').first().waitFor()
  await page.reload({ waitUntil: 'load' })
  await revealNavigationDrawer(page, 'zh')
  await page.getByRole('button', { name: '运维大屏', exact: true }).click()
  await page.locator('[data-ops-monitor] [data-state=paused]').first().waitFor()
  expect((await monitor.snapshot()).monitors[0]?.samples[0]?.status).toBe('ok')
  await page.getByRole('button', { name: /Collapse sidebar|收起侧边栏/u }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'narrow.png') })
  await expect.poll(() => page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  const current = (await monitor.snapshot()).servers[0]!
  await expect(monitor.enable(server.id, ['linux-health'], 'stale-target')).rejects.toMatchObject({ code: 'targetChanged' })
  await expect(monitor.enable(current.id, [], current.target)).rejects.toThrow()
  expect((await monitor.snapshot()).monitors[0]?.enabled).toBe(false)
  execute.mockResolvedValue({ output: 'invalid metrics', exitCode: 0, interrupted: false, truncated: false })
  await monitor.enable(current.id, ['linux-health'], current.target)
  await page.getByText(/指标输出不符合预期，请检查 Linux 命令及权限/u).waitFor({ timeout: 20000 })
  expect(await page.getByText('24.5 %', { exact: true }).count()).toBe(0)
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'failure.png') })
  execute.mockImplementation(async (_server, script) => ({
    output: script.includes('df -Pk') ? 'disk_percent\t72\t%\t/\n' : 'invalid health',
    exitCode: 0, interrupted: false, truncated: false,
  }))
  await monitor.enable(current.id, ['linux-health', 'linux-filesystems'], current.target)
  await page.locator('[data-state=partial]').waitFor({ timeout: 20000 })
  expect(await page.getByRole('meter').getAttribute('aria-valuenow')).toBe('72')
  expect(await page.getByText('24.5 %', { exact: true }).count()).toBe(0)
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'partial.png') })
  await page.getByLabel('筛选主机', { exact: true }).selectOption(current.id)
  await page.getByRole('heading', { name: server.name, exact: true }).waitFor()
  expect(await page.getByRole('region', { name: '主机当前指标' }).getByText('暂无数据', { exact: true }).count()).toBe(4)
  expect(await page.getByRole('meter').getAttribute('aria-valuenow')).toBe('72')
  await expect.poll(() => page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'host-partial-narrow.png') })
}, 120000)

it('renders a restored fleet as six chart panels and filters all panels together', async () => {
  const scaffold = await launchWebScaffold({ extraInstallAnchors: [join(PACKAGE, 'package.json')] })
  onTestFinished(() => scaffold.close())
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.setViewportSize({ width: 1920, height: 1080 })
  const { monitorDomain } = await import('../../../packages/client/ui-ops-monitor/src/spec.ts')
  const domain = await scaffold.ctx.storageDomain.open(monitorDomain)
  const now = Date.now()
  for (const [index, name] of ['api-prod-01', 'worker-prod-02', 'db-primary-01', 'cache-prod-01'].entries()) {
    const server = await scaffold.ctx.remoteOps.repository.save({ name, group: 'Chart fixture', host: `192.0.2.${index + 1}`, port: 22,
      username: 'monitor', auth: 'password', secret: 'fixture-only', passphrase: '', fingerprint: `SHA256:${'A'.repeat(43)}` })
    await domain.table('monitors').put(server.id, { serverId: server.id, name, enabled: index !== 3,
      target: JSON.stringify([server.host, server.port, server.username, server.auth, server.fingerprint]), templates: ['linux-health', 'linux-filesystems', 'linux-capacity', 'linux-network', 'linux-processes'],
      samples: Array.from({ length: 36 }, (_, point) => ({ at: now - (36 - point) * 60000, status: point === 19 && index === 1 ? 'parse' : 'ok',
        metrics: point === 19 && index === 1 ? [] : [
          { name: 'cpu_percent', value: 20 + index * 12 + Math.sin(point * .7 + index) * 13 + (point > 22 && point < 27 ? 18 : 0), unit: '%', label: '-' },
          { name: 'memory_percent', value: 35 + index * 13 + Math.sin(point * .25 + index) * 8, unit: '%', label: '-' },
          { name: 'load_1m', value: 1.1 + index * .8 + Math.sin(point * .5 + index) * .8, unit: 'load', label: '-' },
          { name: 'disk_percent', value: 42 + index * 17, unit: '%', label: '/' },
          { name: 'disk_percent', value: 32 + index * 20, unit: '%', label: '/data' },
          { name: 'memory_total_bytes', value: 16 * 1024 ** 3, unit: 'B', label: '-' },
          { name: 'memory_used_bytes', value: (6 + index) * 1024 ** 3, unit: 'B', label: '-' },
          { name: 'filesystem_total_bytes', value: 100 * 1024 ** 3, unit: 'B', label: '/' },
          { name: 'filesystem_used_bytes', value: (30 + index * 15) * 1024 ** 3, unit: 'B', label: '/' },
          { name: 'network_boot_id', value: 'boot-1', unit: 'text', label: '-' },
          { name: 'network_receive_bytes', value: 1000000000 + point * 60000000, unit: 'B', label: 'eth0' },
          { name: 'network_transmit_bytes', value: 1000000000 + point * 30000000, unit: 'B', label: 'eth0' },
          { name: 'network_receive_rate', value: (2 + index + Math.sin(point * .35)) * 1024 ** 2, unit: 'B/s', label: 'eth0' },
          { name: 'network_transmit_rate', value: (1 + index + Math.sin(point * .6) * .5) * 1024 ** 2, unit: 'B/s', label: 'eth0' },
          { name: 'network_receive_bytes', value: 100000000 + point * 6000000, unit: 'B', label: 'eth1' },
          { name: 'network_transmit_bytes', value: 100000000 + point * 3000000, unit: 'B', label: 'eth1' },
          { name: 'network_receive_rate', value: (.2 + index * .1 + Math.sin(point * .35) * .1) * 1024 ** 2, unit: 'B/s', label: 'eth1' },
          { name: 'network_transmit_rate', value: (.1 + index * .1 + Math.sin(point * .6) * .05) * 1024 ** 2, unit: 'B/s', label: 'eth1' },
          { name: 'cpu_process_percent', value: 215 - index * 23, unit: '%', label: '42' },
          { name: 'cpu_process_name', value: 'api-worker', unit: 'text', label: '42' },
          { name: 'memory_process_percent', value: 32 + index * 3, unit: '%', label: '17' },
          { name: 'memory_process_name', value: 'cache-server', unit: 'text', label: '17' },
        ] })),
    })
  }
  await domain.close()
  const execute = vi.spyOn(scaffold.ctx.remoteOps.connections, 'execute').mockImplementation(async (_server, script) => ({
    output: script.includes('network_boot_id') ? 'network_boot_id\tboot-1\ttext\t-\nnetwork_receive_bytes\t3160000000\tB\teth0\nnetwork_transmit_bytes\t2080000000\tB\teth0\nnetwork_receive_bytes\t316000000\tB\teth1\nnetwork_transmit_bytes\t208000000\tB\teth1\n'
      : script.includes('cpu_process_name') ? 'cpu_process_percent\t215\t%\t42\ncpu_process_name\tapi-worker\ttext\t42\nmemory_process_percent\t32\t%\t17\nmemory_process_name\tcache-server\ttext\t17\n'
        : script.includes('memory_total_bytes') ? 'memory_total_bytes\t17179869184\tB\t-\nmemory_used_bytes\t8589934592\tB\t-\nmemory_available_bytes\t8589934592\tB\t-\nfilesystem_total_bytes\t107374182400\tB\t/\nfilesystem_used_bytes\t75161927680\tB\t/\nfilesystem_available_bytes\t32212254720\tB\t/\n'
          : script.includes('df -Pk') ? 'disk_percent\t72\t%\t/\ndisk_percent\t88\t%\t/data\n' : health,
    exitCode: 0, interrupted: false, truncated: false,
  }))
  onTestFinished(() => { execute.mockRestore() })
  await scaffold.ctx.loader.create({ name: '@deepseek-ai/dsh-client-ui-ops-monitor', config: { intervalMs: 60000, streamIntervalMs: 1000 } })
  await scaffold.ctx.settings.update('locale', { preference: 'zh' })
  await scaffold.ctx.settings.update('ui-theme', { preference: 'dark' })
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await revealNavigationDrawer(page, 'zh')
  await page.getByRole('button', { name: '运维大屏', exact: true }).click()
  await page.getByRole('heading', { name: 'CPU 使用率趋势' }).waitFor()
  await page.getByRole('button', { name: '全屏展示', exact: true }).click()
  await page.getByRole('button', { name: '退出全屏', exact: true }).waitFor()
  const charts = page.locator('[data-ops-monitor] section[aria-label="运维大屏"]')
  expect(await charts.locator('article').count()).toBe(12)
  await page.getByLabel('图表视图', { exact: true }).selectOption('overview')
  expect(await charts.locator('article').count()).toBe(6)
  expect(await charts.getByRole('img').count()).toBe(4)
  expect(await charts.locator('polyline').count()).toBeGreaterThan(12)
  expect(await page.getByRole('button', { name: '暂停采集', exact: true }).count()).toBe(0)
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'charts-dark.png') })
  await scaffold.ctx.settings.update('ui-theme', { preference: 'light' })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'charts-light.png') })
  for (const [view, heading, filename] of [
    ['linux-network', '网络入站流量', 'network'],
    ['linux-capacity', '内存容量分布', 'capacity'],
    ['linux-processes', 'CPU 进程排行', 'processes'],
  ]) {
    await page.getByLabel('图表视图', { exact: true }).selectOption(view!)
    await page.getByRole('heading', { name: heading!, exact: true }).waitFor()
    await page.screenshot({ animations: 'disabled', path: join(SHOTS, `${filename}.png`) })
    await scaffold.ctx.settings.update('ui-theme', { preference: 'dark' })
    await page.screenshot({ animations: 'disabled', path: join(SHOTS, `${filename}-dark.png`) })
    await scaffold.ctx.settings.update('ui-theme', { preference: 'light' })
    if (view === 'linux-processes') expect(await charts.getByRole('meter', { name: /api-worker/u }).count()).toBe(3)
    if (view === 'linux-network') expect(await charts.locator('polyline').count()).toBeGreaterThan(4)
  }
  await page.getByLabel('图表视图', { exact: true }).selectOption('overview')
  const first = (await scaffold.ctx.opsMonitor.snapshot()).monitors.find(monitor => monitor.enabled)!
  await page.getByLabel('筛选主机', { exact: true }).selectOption(first.serverId)
  await page.getByRole('heading', { name: first.name, exact: true }).waitFor()
  expect(await charts.getByRole('table').count()).toBe(0)
  expect(await charts.getByRole('heading', { name: '采集状态分布' }).count()).toBe(0)
  expect(await charts.getByRole('meter').count()).toBe(2)
  await page.getByLabel('图表视图', { exact: true }).selectOption('all')
  expect(await charts.locator('article').count()).toBe(10)
  expect(await charts.getByText('eth0', { exact: true }).count()).toBe(2)
  expect(await charts.getByText('eth1', { exact: true }).count()).toBe(2)
  expect(await page.getByRole('region', { name: '主机当前指标' }).count()).toBe(1)
  expect(await charts.getByRole('meter', { name: /api-worker/u }).count()).toBe(1)
  const other = (await scaffold.ctx.opsMonitor.snapshot()).monitors.find(monitor => monitor.serverId !== first.serverId)!
  expect(await charts.getByText(other.name, { exact: true }).count()).toBe(0)
  await scaffold.ctx.settings.update('ui-theme', { preference: 'dark' })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'host-dark.png') })
  await scaffold.ctx.settings.update('ui-theme', { preference: 'light' })
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'host-light.png') })
  await page.getByRole('button', { name: '返回集群总览', exact: true }).click()
  await page.getByRole('heading', { name: '运维大屏', exact: true }).waitFor()
  await page.getByLabel('图表视图', { exact: true }).selectOption('overview')
  await charts.getByRole('button', { name: `查看主机 ${first.name}`, exact: true }).click()
  await page.getByRole('heading', { name: first.name, exact: true }).waitFor()
  await page.getByLabel('筛选主机', { exact: true }).selectOption('')
  await page.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.getByRole('button', { name: '全屏展示', exact: true }).waitFor()
  const collapse = page.getByRole('button', { name: /Collapse sidebar|收起侧边栏/u })
  if (await collapse.isVisible()) await collapse.click()
  for (const width of [1100, 690, 390]) {
    await page.setViewportSize({ width, height: 1000 })
    await expect.poll(() => page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: join(SHOTS, `charts-${width}.png`) })
    if (width === 390) {
      for (const title of ['CPU 使用率趋势', '主机资源热力矩阵', '磁盘占用排行']) {
        await charts.getByRole('heading', { name: title, exact: true }).scrollIntoViewIfNeeded()
        if (title === '磁盘占用排行') {
          await charts.getByRole('meter').first().scrollIntoViewIfNeeded()
          await expect.poll(() => charts.getByRole('meter').first().evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(0)
        }
        await page.screenshot({ animations: 'disabled', path: join(SHOTS, `narrow-${title}.png`) })
      }
    }
  }
  for (const [view, heading, name] of [
    ['linux-network', '网络入站流量', 'network'], ['linux-capacity', '内存容量分布', 'capacity'], ['linux-processes', 'CPU 进程排行', 'processes'],
  ]) {
    await page.getByLabel('图表视图', { exact: true }).selectOption(view!)
    await page.getByRole('heading', { name: heading!, exact: true }).scrollIntoViewIfNeeded()
    if (view !== 'linux-network') await charts.getByRole('meter').first().scrollIntoViewIfNeeded()
    await expect.poll(() => page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
    await page.screenshot({ animations: 'disabled', path: join(SHOTS, `${name}-narrow.png`) })
  }
  await page.getByLabel('筛选主机', { exact: true }).selectOption(first.serverId)
  await page.getByLabel('图表视图', { exact: true }).selectOption('all')
  await page.getByRole('heading', { name: first.name, exact: true }).scrollIntoViewIfNeeded()
  await expect.poll(() => page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'host-narrow.png') })
  await charts.getByRole('heading', { name: '网络入站流量', exact: true }).scrollIntoViewIfNeeded()
  await page.screenshot({ animations: 'disabled', path: join(SHOTS, 'host-network-narrow.png') })
  const paused = (await scaffold.ctx.opsMonitor.snapshot()).monitors.find(monitor => !monitor.enabled)!
  await page.getByLabel('筛选主机', { exact: true }).selectOption(paused.serverId)
  await page.getByRole('heading', { name: paused.name, exact: true }).waitFor()
  expect(await page.getByRole('region', { name: '主机当前指标' }).getByText('暂无数据', { exact: true }).count()).toBe(4)
  expect(await charts.getByRole('meter').count()).toBe(0)
  expect(await charts.locator('polyline').count()).toBeGreaterThan(0)
  await page.getByRole('button', { name: '返回集群总览', exact: true }).click()
  await page.getByRole('button', { name: '监控管理', exact: true }).click()
  await page.getByRole('button', { name: '配置 / 恢复', exact: true }).click()
  expect(await page.getByRole('checkbox', { checked: true }).count()).toBe(5)
  await page.getByRole('button', { name: '取消', exact: true }).click()

}, 120000)

it('keeps configuration accessible when the monitoring backend fails', async () => {
  const scaffold = await launchWebScaffold({ extraInstallAnchors: [join(PACKAGE, 'package.json')] })
  onTestFinished(() => scaffold.close())
  await scaffold.ctx.loader.create({ name: '@deepseek-ai/dsh-client-ui-ops-monitor' })
  const snapshot = vi.spyOn(scaffold.ctx.opsMonitor, 'snapshot').mockRejectedValue(new Error('private-host-detail'))
  onTestFinished(() => { snapshot.mockRestore() })
  const browser = await chromium.launch()
  onTestFinished(() => browser.close())
  const page = await newEnglishPage(browser)
  await page.goto(scaffold.authenticatedUrl, { waitUntil: 'load' })
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByText('gateway/internal', { exact: true }).waitFor()
  expect(await page.getByText('private-host-detail').count()).toBe(0)
  expect(await page.getByRole('button', { name: 'Enable monitoring', exact: true }).isDisabled()).toBe(true)
  await page.getByRole('button', { name: 'Collapse sidebar', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: join(SHOTS, 'setup-failure.png') })
  expect(await page.locator('[data-ops-monitor]').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  await page.getByRole('button', { name: 'Manage SSH servers', exact: true }).click()
  await page.getByRole('heading', { name: 'Remote operations', exact: true }).waitFor()
  snapshot.mockRestore()
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByRole('heading', { name: 'Connect your first server' }).waitFor()
  const remoteEntry = [...scaffold.ctx.loader.entries()].find(row => row.options.id === 'ui-remote-ops')
  expect(remoteEntry).toBeDefined()
  await remoteEntry!.update({ disabled: true })
  await scaffold.ctx.loader.await()
  await page.reload({ waitUntil: 'load' })
  await revealNavigationDrawer(page, 'en')
  await page.getByRole('button', { name: 'Operations dashboard', exact: true }).click()
  await page.getByRole('button', { name: 'Manage SSH servers', exact: true }).click()
  await page.getByText('Remote operations is unavailable. Install and enable the companion plugin, then retry.', { exact: true }).waitFor()
  await page.getByRole('button', { name: 'Manage plugins', exact: true }).click()
}, 60000)
