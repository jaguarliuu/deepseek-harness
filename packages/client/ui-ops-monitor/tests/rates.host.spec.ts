/** Rate derivation preserves discontinuities and separates interface identities. */
import { expect, it } from 'vitest'
import { withNetworkRates } from '../src/rates.ts'
import type { Sample } from '../src/types.ts'
function sample(at: number, bytes: number, boot = 'boot-1', label = 'eth0'): Sample {
  return { at, status: 'ok', metrics: [
    { name: 'network_boot_id', value: boot, unit: 'text', label: '-' },
    { name: 'network_receive_bytes', value: bytes, unit: 'B', label },
    { name: 'network_transmit_bytes', value: bytes * 2, unit: 'B', label },
  ] }
}
it('derives bytes per second using actual elapsed time and keeps counters', () => {
  expect(withNetworkRates(sample(1000, 1000), sample(3000, 5000)).metrics).toEqual([
    ...sample(3000, 5000).metrics,
    { name: 'network_receive_rate', value: 2000, unit: 'B/s', label: 'eth0' },
    { name: 'network_transmit_rate', value: 4000, unit: 'B/s', label: 'eth0' },
  ])
})
it.each([
  undefined,
  sample(3000, 1000),
  sample(4000, 1000),
  sample(1000, 10000),
  sample(1000, 1000, 'different-boot'),
  sample(1000, 1000, 'boot-1', 'eth1'),
  { at: 1000, status: 'parse', metrics: [] } satisfies Sample,
])('leaves a gap without a comparable previous observation', (previous) => {
  expect(withNetworkRates(previous, sample(3000, 5000)).metrics).toHaveLength(3)
})
it('retains network rates when an independent collector fails', () => {
  const partial: Sample = { ...sample(3000, 5000), status: 'partial', failures: [{ templateId: 'linux-processes', status: 'parse' }] }
  expect(withNetworkRates(sample(1000, 1000), partial)).toMatchObject({ status: 'partial', failures: partial.failures })
  expect(withNetworkRates(sample(1000, 1000), partial).metrics).toHaveLength(5)
})
