/** Network counters become rates only across adjacent successful observations of the same boot and interface. */
import type { Sample } from './types.ts'
/**
 * Append bytes-per-second metrics without inventing a baseline after failure, reboot or counter reset.
 * @param previous - immediately preceding saved attempt, if any.
 * @param current - newly collected attempt; original counter metrics remain available.
 * @returns the current attempt with any valid network rates appended.
 */
export function withNetworkRates(previous: Sample | undefined, current: Sample): Sample {
  if (!previous || current.at <= previous.at) return current
  const boot = current.metrics.find(m => m.name === 'network_boot_id')?.value
  if (typeof boot !== 'string' || boot !== previous.metrics.find(m => m.name === 'network_boot_id')?.value) return current
  const metrics = [...current.metrics]
  for (const counter of current.metrics) {
    const name = counter.name === 'network_receive_bytes' ? 'network_receive_rate'
      : counter.name === 'network_transmit_bytes' ? 'network_transmit_rate' : undefined
    if (!name || typeof counter.value !== 'number') continue
    const before = previous.metrics.find(m => m.name === counter.name && m.label === counter.label)?.value
    if (typeof before !== 'number' || counter.value < before) continue
    metrics.push({ name, label: counter.label, unit: 'B/s', value: (counter.value - before) * 1000 / (current.at - previous.at) })
  }
  return { ...current, metrics }
}
