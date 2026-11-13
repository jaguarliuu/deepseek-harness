/** Remote output must represent complete measurements, never plausible fallback zeroes. */
import { expect, it } from 'vitest'
import { parseMetrics } from '../src/templates.ts'
const health = 'cpu_percent\t24.5\t%\t-\nmemory_percent\t61\t%\t-\nload_1m\t1.2\tload\t-\nuptime_seconds\t3600\ts\t-\n'
it('parses percentages, load, uptime and mount points containing spaces', () => {
  expect(parseMetrics('linux-health', health).map(m => m.value)).toEqual([24.5, 61, 1.2, 3600])
  expect(parseMetrics('linux-filesystems', 'disk_percent\t72\t%\t/mount with spaces\n')).toEqual([
    { name: 'disk_percent', value: 72, unit: '%', label: '/mount with spaces' },
  ])
})
it.each(['', health.replace('24.5', 'NaN'), health.replace('24.5', '101'), health.replace('24.5', ''), health.replace('load_1m', 'unknown'), health + 'cpu_percent\t1\t%\t-\n', health.split('\n').slice(1).join('\n'), health.replace('load\t', '%\t')])('rejects malformed, missing, duplicate and invalid metrics', (output) => {
  expect(() => parseMetrics('linux-health', output)).toThrow()
})
it('rejects unbounded filesystem inventories', () => {
  expect(() => parseMetrics('linux-filesystems', Array.from({ length: 129 }, (_, i) => `disk_percent\t1\t%\t/mnt/${i}`).join('\n'))).toThrow()
})
it('uses definitions for string fields and allows process CPU above one core', () => {
  expect(parseMetrics('linux-processes', 'cpu_process_percent\t250\t%\t42\ncpu_process_name\tworker <tag>\ttext\t42\nmemory_process_percent\t10\t%\t11\nmemory_process_name\tcache\ttext\t11\n')).toEqual([
    { name: 'cpu_process_percent', value: 250, unit: '%', label: '42' },
    { name: 'cpu_process_name', value: 'worker <tag>', unit: 'text', label: '42' },
    { name: 'memory_process_percent', value: 10, unit: '%', label: '11' },
    { name: 'memory_process_name', value: 'cache', unit: 'text', label: '11' },
  ])
})
it('requires every field for each interface instead of accepting mismatched labels', () => {
  const network = 'network_boot_id\tabc\ttext\t-\nnetwork_receive_bytes\t1000\tB\teth0\nnetwork_transmit_bytes\t2000\tB\teth0\n'
  expect(parseMetrics('linux-network', network)).toHaveLength(3)
  expect(() => parseMetrics('linux-network', network.replace('1000', '9007199254740992'))).toThrow('Invalid byte counter')
  expect(() => parseMetrics('linux-network', network.replace('2000\tB\teth0', '2000\tB\teth1'))).toThrow('Missing metric')
  expect(() => parseMetrics('linux-network', network.replace('abc', 'abc\u001b'))).toThrow('Invalid text metric')
})
it('rejects incomplete capacity groups and wrong units', () => {
  expect(() => parseMetrics('linux-capacity', 'memory_total_bytes\t1000\tB\t-')).toThrow('Missing metric')
  expect(() => parseMetrics('linux-network', 'network_receive_bytes\t1000\tMB\teth0')).toThrow('Invalid metric fields')
})
